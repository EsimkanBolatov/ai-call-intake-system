import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { CasesService } from '../cases/cases.service';

@Injectable()
export class VoiceAiService { // <--- БЫЛО AiService, СТАЛО VoiceAiService
  private openai: OpenAI;
  private logger = new Logger(VoiceAiService.name); // <--- Обновили имя логгера
  
  // Хранилище контекста диалогов (Session ID -> Data)
  private conversationHistory = new Map<string, any[]>(); // Полная история для аналитики
  private dispatcherHistory = new Map<string, any[]>();   // История для персоны диспетчера
  public incidentData = new Map<string, any>();           // Накопленные данные (CAD)

  private readonly recordingsDir = path.resolve('./recordings');
  private readonly tempDir = path.resolve('./temp');
  private readonly erdrApiUrl: string;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => CasesService))
    private casesService: CasesService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 30000,
    });

    this.erdrApiUrl = this.configService.get<string>('ERDR_API_URL') || 'http://127.0.0.1:8000';

    // Создаем папки, если их нет
    if (!fs.existsSync(this.recordingsDir)) fs.mkdirSync(this.recordingsDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // ========================================================================
  // 🟢 ЧАСТЬ 1: ГОЛОСОВОЙ ШЛЮЗ (Voice Gateway Pipeline)
  // ========================================================================

  /**
   * Основной пайплайн обработки голосового чанка:
   * Audio Buffer -> STT -> (Analyze + Generate Answer) -> TTS -> Audio Response
   */
  async processAudio(audioBuffer: Buffer, sessionId: string) {
    // 1. Сохраняем входящий аудио-фрагмент (для истории/отладки)
    const userFile = path.join(this.recordingsDir, `${sessionId}_user_${Date.now()}.wav`);
    fs.writeFileSync(userFile, audioBuffer);

    // 2. Распознавание речи (STT) - Реальный Whisper
    const userText = await this.speechToText(audioBuffer, sessionId);
    
    // Фильтр тишины или пустых запросов
    if (!userText || userText.trim().length < 2) {
       return { text: "", response: "", audio: null, incident: this.incidentData.get(sessionId) };
    }

    this.logger.log(`[${sessionId}] 📞 User: ${userText}`);

    // Получаем текущий контекст инцидента
    const currentIncident = this.incidentData.get(sessionId) || {};

    // 3. Параллельный запуск: Анализ данных и Генерация ответа диспетчера
    let incidentAnalysis = {};
    let dispatcherResponse = "";

    try {
        const [analysisRes, dispatchRes] = await Promise.allSettled([
            this.analyzeIncidentForErdr(userText),
            this.generateDispatcherResponse(userText, sessionId, currentIncident)
        ]);

        if (analysisRes.status === 'fulfilled') incidentAnalysis = analysisRes.value;
        if (dispatchRes.status === 'fulfilled') dispatcherResponse = dispatchRes.value;

    } catch (e) {
        this.logger.error(`[${sessionId}] AI Processing Error`, e);
    }

    // 4. Объединение данных (Merge CAD Data)
    const mergedIncident = this.mergeIncidentData(sessionId, incidentAnalysis);

    // 5. Генерация речи (TTS)
    let responseAudio: Buffer = null;
    if (dispatcherResponse) {
        responseAudio = await this.textToSpeech(dispatcherResponse);
        // Сохраняем ответ системы
        const aiFile = path.join(this.recordingsDir, `${sessionId}_ai_${Date.now()}.mp3`);
        fs.writeFileSync(aiFile, responseAudio);
    }

    return {
      text: userText,
      response: dispatcherResponse,
      audio: responseAudio,
      incident: mergedIncident,
    };
  }

  /**
   * Реальная транскрипция через Whisper (Helper)
   */
  async speechToText(audioBuffer: Buffer, sessionId: string): Promise<string> {
    const tempPath = path.join(this.tempDir, `${sessionId}_stt_${Date.now()}.wav`);
    try {
      fs.writeFileSync(tempPath, audioBuffer);
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: "whisper-1",
        language: "ru",
      });
      return transcription.text;
    } catch (error) {
      this.logger.error(`STT Error: ${error.message}`);
      return ""; 
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  /**
   * Генерация голоса через TTS (Helper)
   */
  async textToSpeech(text: string): Promise<Buffer> {
    try {
        const mp3 = await this.openai.audio.speech.create({
            model: "tts-1",
            voice: "alloy", // alloy, echo, fable, onyx, nova, shimmer
            input: text,
            response_format: "mp3",
        });
        return Buffer.from(await mp3.arrayBuffer());
    } catch (e) { 
        this.logger.error(`TTS Error: ${e.message}`);
        return Buffer.from(""); 
    }
  }

  /**
   * Персона Диспетчера 102
   */
  async generateDispatcherResponse(userMessage: string, sessionId: string, incidentContext: any) {
    if (!this.dispatcherHistory.has(sessionId)) {
      this.dispatcherHistory.set(sessionId, [{
          role: "system",
          content: `Ты — диспетчер экстренных служб 102 (полиция).
Твоя задача — профессионально общаться с заявителем.

ПРИНЦИПЫ:
1. **ПРИОРИТЕТ ЖИЗНИ**: Если угроза жизни — СРАЗУ отправляй наряд.
2. **АДАПТИВНОСТЬ**:
   * **CRITICAL**: Только "ГДЕ?" и "ЕСТЬ ЛИ ОРУЖИЕ?".
   * **MEDIUM**: Действуй по протоколу (Что, Где, Кто).
3. **СТИЛЬ**: Кратко (макс 2 предложения). Четкие команды.`
      }]);
    }

    const history = this.dispatcherHistory.get(sessionId);
    
    // Добавляем контекст срочности
    let systemContext = "";
    if (incidentContext?.priority === 'critical' || incidentContext?.priority === 'high') {
        systemContext = `[СИТУАЦИЯ КРИТИЧЕСКАЯ! ПРИОРИТЕТ: ${incidentContext.priority}. БУДЬ ПРЕДЕЛЬНО КРАТОК!]`;
    }
    
    history.push({ role: "user", content: systemContext ? `${systemContext} ${userMessage}` : userMessage });

    const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: history,
        max_tokens: 150,
    });

    const response = completion.choices[0].message.content;
    history.push({ role: "assistant", content: response });
    
    // Ограничиваем историю
    if (history.length > 20) {
         this.dispatcherHistory.set(sessionId, [history[0], ...history.slice(-18)]);
    }
    
    return response;
  }

  /**
   * Анализ для ЕРДР (JSON Extractor)
   */
  async analyzeIncidentForErdr(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Верни ТОЛЬКО валидный JSON для регистрации в ЕРДР.
Поля:
- priority: "critical" | "high" | "medium" | "low"
- categoryRu: "название категории (ДТП, Кража, Убийство...)"
- address: "адрес происшествия или null"
- callerName: "ФИО заявителя или null"
- erdr_event_description: "Краткая фабула для протокола"
- erdr_district: "Заводской район" (по умолчанию) или "Алматинский район"
- emotion: "эмоция заявителя"`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) { 
        return { priority: "medium", categoryRu: "Не определено" }; 
    }
  }

  private mergeIncidentData(sessionId: string, newData: any) {
    const current = this.incidentData.get(sessionId) || {};
    // Простой merge, приоритет новым данным, если они не null
    const merged = { ...current };
    Object.keys(newData).forEach(key => {
        if (newData[key] !== null && newData[key] !== undefined && newData[key] !== "Не определено") {
            merged[key] = newData[key];
        }
    });
    this.incidentData.set(sessionId, merged);
    return merged;
  }

  // ========================================================================
  // 🔵 ЧАСТЬ 2: REST API (Web Simulator Functions)
  // ========================================================================

  /**
   * Классификация текста (для веб-симулятора)
   */
  async classifyText(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты диспетчер. Проанализируй текст и верни JSON:
            {
              "categories": ["категория"],
              "priority": "high/medium/low",
              "serviceType": "police/fire/ambulance/emergency/other",
              "emotion": "спокойный/паника/агрессия",
              "keywords": ["слова"]
            }`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      this.logger.error("Classify Text Error", e);
      return { categories: ["error"], priority: "low", serviceType: "other" };
    }
  }

  /**
   * Реальная транскрипция файла (для REST API загрузки)
   */
  async transcribeAudio(file: Express.Multer.File) {
    const tempPath = path.join(this.tempDir, `rest_upload_${Date.now()}_${file.originalname}`);
    try {
        fs.writeFileSync(tempPath, file.buffer);
        
        const transcription = await this.openai.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "whisper-1",
            language: "ru",
        });
        
        return { text: transcription.text };
    } catch (error) {
        this.logger.error("REST Transcribe Error", error);
        throw new Error("Ошибка транскрипции");
    } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
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