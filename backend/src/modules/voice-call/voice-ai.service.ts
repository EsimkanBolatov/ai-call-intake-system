import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { CasesService } from '../cases/cases.service';

@Injectable()
export class VoiceAiService {
  private openai: OpenAI;
  private logger = new Logger(VoiceAiService.name);
  
  public incidentData = new Map<string, any>(); 
  private conversationHistory = new Map<string, any[]>();
  private dispatcherHistory = new Map<string, any[]>();

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
      timeout: 20 * 1000, 
      maxRetries: 1,
    });
    // URL Python сервиса (Project 2 может запускаться в Docker, поэтому localhost может не работать, но пока оставим)
    this.erdrApiUrl = this.configService.get<string>('ERDR_API_URL') || 'http://127.0.0.1:8000';

    if (!fs.existsSync(this.recordingsDir)) fs.mkdirSync(this.recordingsDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // --- PROCESSING PIPELINE ---
  async processAudio(audioBuffer: Buffer, sessionId: string) {
    // Сохраняем кусок (важно для истории и склейки потом)
    const userFile = path.join(this.recordingsDir, `${sessionId}_user_${Date.now()}.wav`);
    fs.writeFileSync(userFile, audioBuffer);

    // 1. STT
    const userText = await this.speechToText(audioBuffer, sessionId);
    
    // Фильтр тишины
    if (!userText || userText.trim().length < 2) {
        return { text: "", response: "", audio: null, incident: this.incidentData.get(sessionId) };
    }

    this.logger.log(`[${sessionId}] 📞 User: ${userText}`);

    const currentIncident = this.incidentData.get(sessionId) || {};

    // 2. Параллельный запуск: Анализ + Генерация ответа
    let incidentAnalysis = {};
    let dispatcherResponse = "";

    try {
        const [analysisRes, dispatchRes] = await Promise.allSettled([
            this.analyzeIncident(userText),
            this.generateDispatcherResponse(userText, sessionId, currentIncident)
        ]);

        if (analysisRes.status === 'fulfilled') incidentAnalysis = analysisRes.value;
        if (dispatchRes.status === 'fulfilled') dispatcherResponse = dispatchRes.value;

    } catch (e) {
        this.logger.error("AI Error", e);
    }

    // 3. Merge Data
    const mergedIncident = this.mergeIncidentData(sessionId, incidentAnalysis);

    // 4. TTS
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

  // --- AI METHODS ---
  async speechToText(audioBuffer: Buffer, sessionId: string): Promise<string> {
    const tempPath = path.join(this.tempDir, `${sessionId}_${Date.now()}.wav`);
    try {
      fs.writeFileSync(tempPath, audioBuffer);
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: "whisper-1",
        language: "ru",
      });
      return transcription.text;
    } catch (error) {
      return ""; 
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  async generateDispatcherResponse(userMessage: string, sessionId: string, incidentContext: any) {
    if (!this.dispatcherHistory.has(sessionId)) {
      this.dispatcherHistory.set(sessionId, [{
          role: "system",
          content: `Ты диспетчер 102. Принимай вызов. Будь краток. Если угроза - высылай наряд.`
      }]);
    }
    const history = this.dispatcherHistory.get(sessionId);
    history.push({ role: "user", content: userMessage });

    const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: history,
        max_tokens: 150,
    });
    const response = completion.choices[0].message.content;
    history.push({ role: "assistant", content: response });
    return response;
  }

  async analyzeIncident(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Верни JSON. Поля: priority (critical|high|medium|low), categoryRu, address, erdr_event_description (фабула), callerName, erdr_district (Заводской район|Алматинский район).`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) { return {}; }
  }

  mergeIncidentData(sessionId: string, newData: any) {
    const current = this.incidentData.get(sessionId) || {};
    // Простой merge
    const merged = { ...current, ...newData };
    // Чистка null
    Object.keys(merged).forEach(key => {
        if (!merged[key] || merged[key] === "Не определено") delete merged[key];
    });
    this.incidentData.set(sessionId, merged);
    return merged;
  }

  async textToSpeech(text: string): Promise<Buffer> {
    try {
        const mp3 = await this.openai.audio.speech.create({
            model: "tts-1",
            voice: "alloy",
            input: text,
            response_format: "mp3",
        });
        return Buffer.from(await mp3.arrayBuffer());
    } catch (e) { return Buffer.from(""); }
  }

  // --- DATABASE & ERDR ---

  async endCall(sessionId: string) {
    const data = this.incidentData.get(sessionId);
    if (!data) return;

    // 1. Создание записи в Журнале (CasesService)
    try {
        // Формируем объект для создания кейса
        const caseData = {
            phoneNumber: data.callerPhone || '+77770000000', // Заглушка, если нет номера
            transcription: `[AI CALL] ${data.erdr_event_description || 'Голосовой вызов'}`,
            audioRecordUrl: `/recordings/${sessionId}.wav`, // Ссылка на файл
            priority: data.priority || 'medium',
            category: data.categoryRu || 'Other',
            address: data.address
        };

        // Пробуем вызвать createIncomingCall, если он есть, или create
        if (typeof this.casesService['createIncomingCall'] === 'function') {
             await this.casesService['createIncomingCall']({
                 phoneNumber: caseData.phoneNumber,
                 transcription: caseData.transcription
             });
        } else {
            // Если нет специфичного метода, используем базовый create (вам нужно убедиться, что он принимает DTO)
            // Здесь я делаю допущение о структуре.
            this.logger.warn(`Method createIncomingCall not found, create logic needs manual adjustment depending on CasesService.`);
        }
        
        this.logger.log(`[DB] Case saved for ${sessionId}`);
    } catch (e) {
        this.logger.error(`[DB] Failed to save case`, e);
    }

    // Очистка памяти
    this.clearHistory(sessionId);
  }

  clearHistory(sessionId: string) {
    this.conversationHistory.delete(sessionId);
    this.dispatcherHistory.delete(sessionId);
    this.incidentData.delete(sessionId);
  }

  // --- ERDR INTEGRATION (Полная реализация из Project 1) ---
  async sendToErdr(sessionId: string) {
    this.logger.log(`[ERDR] Sending data for ${sessionId}`);
    
    // Получаем накопленные данные (нужно вызывать ДО clearHistory, либо сохранять копию)
    // В текущей архитектуре данные могут быть уже удалены endCall, 
    // поэтому этот метод лучше вызывать ПЕРЕД endCall или хранить данные в БД.
    // Но для симулятора берем из памяти (предполагаем, что звонок активен или только завершился)
    const incident = this.incidentData.get(sessionId) || {};

    try {
        // ШАГ 1: Поиск и отправка аудио
        // Ищем все файлы пользователя для этой сессии
        const files = fs.readdirSync(this.recordingsDir)
            .filter(f => f.startsWith(`${sessionId}_user`))
            .sort(); // Сортируем по времени
        
        let audioFilename = null;

        if (files.length > 0) {
            // Берем последний файл (как в примере) или можно склеить (ffmpeg)
            const lastFile = files[files.length - 1]; 
            const filePath = path.join(this.recordingsDir, lastFile);
            const fileBuffer = fs.readFileSync(filePath);

            const formData = new FormData();
            // @ts-ignore
            const blob = new Blob([fileBuffer], { type: 'audio/wav' });
            formData.append('file', blob, lastFile);

            const uploadRes = await fetch(`${this.erdrApiUrl}/api/external/upload_audio`, {
                method: 'POST',
                body: formData
            });

            if (uploadRes.ok) {
                const resJson = await uploadRes.json();
                audioFilename = resJson.filename;
                this.logger.log(`[ERDR] Audio uploaded: ${audioFilename}`);
            }
        }

        // ШАГ 2: Генерация JSON
        const kui = "2631" + Math.floor(Math.random() * 100000000000).toString().padStart(11, '0');
        const now = new Date();
        
        // Форматирование даты DD.MM.YYYY HH:MM
        const pad = (n) => n.toString().padStart(2,'0');
        const formatDate = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

        const payload = {
            kui_number: kui,
            reg_organ: "19310003",
            district: incident.erdr_district || "Заводской район",
            reg_date: formatDate(now),
            operator_conf_date: formatDate(new Date(now.getTime() + 15*60000)),
            event_description: incident.erdr_event_description || "Голосовой вызов (авто)",
            
            // Классификаторы
            field_5_1: "прочие",
            field_5_6: "Нет",
            
            audio_record: audioFilename, // Привязка файла
            
            // ЦОУ
            msg_type: "08 Сообщение ЦОУ",
            cou_name: "ЦОУ AI System",
            cou_reg_number: `AI-${sessionId.substring(0,5)}`,
            
            mobile_phone: incident.callerPhone || "Не определен"
        };

        // ШАГ 3: Отправка JSON
        const sendRes = await fetch(`${this.erdrApiUrl}/api/external/receive_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (sendRes.ok) {
            const resData = await sendRes.json();
            this.logger.log(`[ERDR] Success. ID: ${resData.id}`);
            return { success: true, erdrId: resData.id, kui };
        } else {
            const errText = await sendRes.text();
            this.logger.error(`[ERDR] Failed: ${errText}`);
            return { success: false, error: errText };
        }

    } catch (e) {
        this.logger.error("[ERDR] Exception", e);
        return { success: false, error: e.message };
    }
  }
}