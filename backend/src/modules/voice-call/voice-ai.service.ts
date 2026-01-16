import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { CasesService } from '../cases/cases.service';

@Injectable()
export class VoiceAiService { // <--- БЫЛО AiService, СТАЛО VoiceAiService
  private logger = new Logger(VoiceAiService.name); // <--- Обновили имя логгера
  
  // Хранилище контекста диалогов (Session ID -> Data)
  private conversationHistory = new Map<string, any[]>(); // Полная история для аналитики
  private dispatcherHistory = new Map<string, any[]>();   // История для персоны диспетчера
  public incidentData = new Map<string, any>();           // Накопленные данные (CAD)

  private readonly recordingsDir = path.resolve('./recordings');
  private readonly tempDir = path.resolve('./temp');
  private readonly erdrApiUrl: string;
  private readonly aiModuleUrl: string;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => CasesService))
    private casesService: CasesService,
  ) {
    this.erdrApiUrl = this.configService.get<string>('ERDR_API_URL') || 'http://127.0.0.1:8000';
    this.aiModuleUrl = this.configService.get<string>('AI_MODULE_URL') || 'http://127.0.0.1:8001';

    // Создаем папки, если их нет
    if (!fs.existsSync(this.recordingsDir)) fs.mkdirSync(this.recordingsDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // ========================================================================
  // 🟢 ЧАСТЬ 1: ГОЛОСОВОЙ ШЛЮЗ (Voice Gateway Pipeline)
  // ========================================================================

  /**
   * Основной пайплайн обработки голосового чанка:
   * Audio Buffer -> Send to AI Module -> Get response
   */
  async processAudio(audioBuffer: Buffer, sessionId: string, metadata: { sampleRate: number, channels: number }) {
    // 1. Сохраняем входящий аудио-фрагмент (для истории/отладки)
    const userFile = path.join(this.recordingsDir, `${sessionId}_user_${Date.now()}.wav`);
    fs.writeFileSync(userFile, audioBuffer);

    // 2. Отправляем в AI Module
    try {
      const response = await axios.post(`${this.aiModuleUrl}/process-call`, {
        sessionId,
        audioData: audioBuffer.toString('base64'),
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        history: this.dispatcherHistory.get(sessionId) || []
      }, {
        timeout: 30000
      });

      const data = response.data;

      // 3. Сохраняем историю
      if (!this.dispatcherHistory.has(sessionId)) {
        this.dispatcherHistory.set(sessionId, []);
      }
      this.dispatcherHistory.get(sessionId).push(
        { role: 'user', content: data.userText },
        { role: 'assistant', content: data.responseText }
      );

      // 4. Обновляем incident data
      if (data.incident) {
        this.incidentData.set(sessionId, data.incident);
      }

      // 5. Сохраняем аудио ответ, если есть
      let responseAudio: Buffer = null;
      if (data.audioBase64) {
        responseAudio = Buffer.from(data.audioBase64, 'base64');
        const aiFile = path.join(this.recordingsDir, `${sessionId}_ai_${Date.now()}.mp3`);
        fs.writeFileSync(aiFile, responseAudio);
      }

      return {
        text: data.userText,
        response: data.responseText,
        audio: responseAudio,
        incident: data.incident,
      };
    } catch (error) {
      this.logger.error(`[${sessionId}] AI Module request failed: ${error.message}`);
      return { text: "", response: "Извините, произошла ошибка обработки. Попробуйте еще раз.", audio: null, incident: this.incidentData.get(sessionId) };
    }
  }

  // ========================================================================
  // 🔵 ЧАСТЬ 2: REST API (Web Simulator Functions)
  // ========================================================================

  /**
   * Классификация текста (для веб-симулятора) - прокси в AI модуль
   */
  async classifyText(text: string) {
    try {
      const response = await axios.post(`${this.aiModuleUrl}/classify`, {
        text: text,
        enhanced: true
      });
      return response.data;
    } catch (e) {
      this.logger.error("Classify Text Error", e);
      return { categories: ["error"], priority: "low", serviceType: "other" };
    }
  }

  /**
   * Реальная транскрипция файла (для REST API загрузки) - прокси в AI модуль
   */
  async transcribeAudio(file: Express.Multer.File) {
    try {
        const response = await axios.post(`${this.aiModuleUrl}/transcribe`, {
          // TODO: отправить файл через multipart/form-data
          // Пока заглушка
        });
        return response.data;
    } catch (error) {
        this.logger.error("REST Transcribe Error", error);
        throw new Error("Ошибка транскрипции");
    }
  }

  // ========================================================================
  // 🟠 ЧАСТЬ 3: ИНТЕГРАЦИЯ И ЗАВЕРШЕНИЕ
  // ========================================================================

  async endCall(sessionId: string) {
    const data = this.incidentData.get(sessionId);
    if (!data) return;

    // 1. Отправка в ЕРДР (Project 2)
    try {
        await this.sendToErdr(sessionId);
    } catch (e) {
        this.logger.error(`[${sessionId}] ERDR Send Failed`, e);
    }

    // 2. Сохранение в БД (через CasesService)
    try {
        // Создаем кейс
        await this.casesService.createFromCall(
            data.callerPhone || 'Unknown',
            `/recordings/${sessionId}_user.wav`, // Пример пути (нужно логику поиска файла)
            data.erdr_event_description || 'Голосовой диалог'
        );
        this.logger.log(`[DB] Case saved for ${sessionId}`);
    } catch (e) {
        this.logger.error(`[DB] Failed to save case`, e);
    }

    // Очистка памяти
    this.conversationHistory.delete(sessionId);
    this.dispatcherHistory.delete(sessionId);
    this.incidentData.delete(sessionId);
  }

  /**
   * Отправка данных во внешний ERDR сервис (Python)
   */
  async sendToErdr(sessionId: string) {
    this.logger.log(`[ERDR] Sending data for ${sessionId}...`);
    const incident = this.incidentData.get(sessionId) || {};

    // 1. Поиск аудиофайла (последнего записанного пользователя)
    const files = fs.readdirSync(this.recordingsDir)
        .filter(f => f.startsWith(`${sessionId}_user`))
        .sort(); // Сортируем по имени (обычно там timestamp)
    
    let audioFilename = null;

    // Загрузка аудио
    if (files.length > 0) {
        const lastFile = files[files.length - 1];
        const filePath = path.join(this.recordingsDir, lastFile);
        
        try {
            // Используем fetch + Blob/FormData (Node 18+)
            const fileBuffer = fs.readFileSync(filePath);
            const formData = new FormData();
            const blob = new Blob([fileBuffer], { type: 'audio/wav' });
            formData.append('file', blob, lastFile);

            const uploadRes = await fetch(`${this.erdrApiUrl}/api/external/upload_audio`, {
                method: 'POST',
                body: formData
            });

            if (uploadRes.ok) {
                const resJson = await uploadRes.json();
                audioFilename = resJson.filename;
            }
        } catch (e) {
            this.logger.error(`[ERDR] Audio Upload Error: ${e.message}`);
        }
    }

    // Формирование Payload
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatDate = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const now = new Date();
    const kui = "2631" + Math.floor(Math.random() * 100000000000).toString().padStart(11, '0');

    const payload = {
        kui_number: kui,
        reg_organ: "19310003", // УП района
        district: incident.erdr_district || "Заводской район",
        reg_date: formatDate(now),
        operator_conf_date: formatDate(new Date(now.getTime() + 15 * 60000)),
        event_description: incident.erdr_event_description || "Автоматическая регистрация (AI Call)",
        
        field_5_1: "прочие",
        field_5_6: "Нет",
        
        audio_record: audioFilename,
        
        msg_type: "08 Сообщение ЦОУ",
        cou_name: "AI Dispatcher",
        cou_reg_number: `AI-${sessionId.substring(0,6)}`,
        
        mobile_phone: incident.callerPhone || "Не определен"
    };

    // Отправка JSON
    try {
        const res = await fetch(`${this.erdrApiUrl}/api/external/receive_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            this.logger.log(`[ERDR] Success! ID: ${data.id}`);
            return data;
        } else {
            this.logger.error(`[ERDR] Failed: ${await res.text()}`);
        }
    } catch (e) {
        this.logger.error(`[ERDR] Connection Error: ${e.message}`);
    }
  }
}