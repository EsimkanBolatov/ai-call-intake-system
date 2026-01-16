import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { CasesService } from '../cases/cases.service'; // Предполагаем наличие этого сервиса

@Injectable()
export class VoiceAiService {
  private openai: OpenAI;
  private logger = new Logger(VoiceAiService.name);
  
  // Хранилища в памяти (Session Storage)
  public incidentData = new Map<string, any>(); 
  private conversationHistory = new Map<string, any[]>();
  private dispatcherHistory = new Map<string, any[]>();

  // Пути к папкам
  private readonly recordingsDir = path.resolve('./recordings');
  private readonly tempDir = path.resolve('./temp');
  private readonly erdrApiUrl: string;

  constructor(
    private configService: ConfigService,
    // Инжектируем сервис кейсов для сохранения в БД после звонка
    @Inject(forwardRef(() => CasesService))
    private casesService: CasesService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 30 * 1000,
      maxRetries: 2,
    });
    this.erdrApiUrl = this.configService.get<string>('ERDR_API_URL') || 'http://127.0.0.1:8000';

    // Создаем папки если нет
    if (!fs.existsSync(this.recordingsDir)) fs.mkdirSync(this.recordingsDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // --- 1. Обработка аудио потока ---
  async processAudio(audioBuffer: Buffer, sessionId: string) {
    // 1. Сохраняем user audio (кусок)
    const userFile = path.join(this.recordingsDir, `${sessionId}_user_${Date.now()}.wav`);
    fs.writeFileSync(userFile, audioBuffer);

    // 2. STT
    const userText = await this.speechToText(audioBuffer, sessionId);
    this.logger.log(`[${sessionId}] 📞 Заявитель: ${userText}`);

    // Получаем контекст
    const currentIncident = this.incidentData.get(sessionId) || {};

    // 3. Параллельный запуск Аналитика и Диспетчера
    const [incidentAnalysis, dispatcherResponse] = await Promise.all([
      this.analyzeIncident(userText),
      this.generateDispatcherResponse(userText, sessionId, currentIncident),
    ]);

    // 4. Обновление данных
    const mergedIncident = this.mergeIncidentData(sessionId, incidentAnalysis);

    // 5. TTS
    const responseAudio = await this.textToSpeech(dispatcherResponse);

    // Сохраняем ответ AI
    const aiFile = path.join(this.recordingsDir, `${sessionId}_ai_${Date.now()}.mp3`);
    fs.writeFileSync(aiFile, responseAudio);

    return {
      text: userText,
      response: dispatcherResponse,
      audio: responseAudio,
      incident: mergedIncident,
    };
  }

  // --- 2. Speech To Text ---
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
      this.logger.error("STT Error", error);
      return "";
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  // --- 3. Генерация ответа диспетчера ---
  async generateDispatcherResponse(userMessage: string, sessionId: string, incidentContext: any) {
    if (!this.dispatcherHistory.has(sessionId)) {
      this.dispatcherHistory.set(sessionId, [
        {
          role: "system",
          content: `Ты — диспетчер 102. Твоя задача — принять вызов.
          1. Если КРИТИЧЕСКАЯ ситуация (убийство, насилие) -> Спрашивай ТОЛЬКО ГДЕ и ОРУЖИЕ. Говори "Наряд выехал".
          2. Будь краток (макс 2 предложения).
          3. Узнай Имя и Фамилию, если нет угрозы жизни.`
        }
      ]);
    }
    const history = this.dispatcherHistory.get(sessionId);
    
    // Формируем промпт с контекстом из CAD
    let contextInfo = "";
    if (incidentContext?.priority) {
      contextInfo = `[Контекст системы: Приоритет ${incidentContext.priority}, Категория: ${incidentContext.categoryRu || '?'}, Адрес: ${incidentContext.address || 'НЕТ'}]`;
    }

    history.push({ role: "user", content: `${contextInfo} Сообщение: ${userMessage}` });

    const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: history,
        max_tokens: 150,
    });

    const response = completion.choices[0].message.content;
    history.push({ role: "assistant", content: response });
    return response;
  }

  // --- 4. Анализ инцидента (JSON) ---
  async analyzeIncident(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты аналитик. Верни JSON.
            Структура:
            {
              "priority": "critical|high|medium|low",
              "categoryRu": "string",
              "address": "string|null",
              "erdr_event_description": "Фабула для ЕРДР (3 предложения)",
              "erdr_district": "Алматинский район|Заводской район",
              "callerPhone": "string|null",
              "callerName": "string|null"
            }`
          },
          { role: "user", content: text }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      this.logger.error("Analysis failed", e);
      return {};
    }
  }

  // --- 5. Merge Data ---
  mergeIncidentData(sessionId: string, newData: any) {
    const current = this.incidentData.get(sessionId) || {};
    // Простая логика слияния: новые непустые поля перезаписывают старые
    // В продакшене тут нужна более умная логика приоритетов (как в aiService.js)
    const merged = { ...current, ...newData };
    
    // Фильтруем null
    Object.keys(merged).forEach(key => {
        if (merged[key] === null || merged[key] === "Не определено") delete merged[key];
    });
    
    this.incidentData.set(sessionId, merged);
    return merged;
  }

  // --- 6. TTS ---
  async textToSpeech(text: string): Promise<Buffer> {
    const mp3 = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
        response_format: "mp3",
    });
    return Buffer.from(await mp3.arrayBuffer());
  }

  // --- 7. Завершение звонка и Сохранение в БД ---
  // --- 7. Завершение звонка и Сохранение в БД ---
  async endCall(sessionId: string) {
    const data = this.incidentData.get(sessionId);
    if (data) {
        // Создаем кейс в основной БД через CasesService
        try {
            // ИСПРАВЛЕНИЕ: Используем createFromCall с правильными аргументами
            // Сигнатура: createFromCall(phoneNumber, audioUrl, transcription)
            await this.casesService.createFromCall(
                data.callerPhone || 'Не определен',
                `/recordings/${sessionId}.wav`, // Ссылка на аудио (примерная)
                data.erdr_event_description || 'Голосовой вызов' // Текст/Транскрипция
            );
            this.logger.log(`Case created for session ${sessionId}`);
        } catch (e) {
            this.logger.error(`Failed to save case for ${sessionId}`, e);
        }
    }
    this.clearHistory(sessionId);
  }

  clearHistory(sessionId: string) {
    this.conversationHistory.delete(sessionId);
    this.dispatcherHistory.delete(sessionId);
    this.incidentData.delete(sessionId);
  }

  // --- 8. Интеграция с ЕРДР (Python) ---
  async sendToErdr(sessionId: string) {
    this.logger.log(`[ERDR] Sending data for ${sessionId}`);
    // Здесь должна быть логика поиска последнего аудио файла для этой сессии
    // Упрощенно:
    const erdrPayload = {
        kui_number: "2631" + Math.floor(Math.random() * 100000000000),
        // ... остальные поля из this.incidentData.get(sessionId)
        ...this.incidentData.get(sessionId)
    };

    // Реализация fetch к Python серверу
    // const res = await fetch(`${this.erdrApiUrl}/api/external/receive_data`, ...)
    
    return { success: true, kui: erdrPayload.kui_number };
  }
}