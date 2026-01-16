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

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => CasesService))
    private casesService: CasesService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 15 * 1000, // Таймаут 15 секунд
      maxRetries: 1,      // Меньше повторов, чтобы не копить очередь
    });

    if (!fs.existsSync(this.recordingsDir)) fs.mkdirSync(this.recordingsDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  async processAudio(audioBuffer: Buffer, sessionId: string) {
    // Сохраняем входящий кусок для истории
    const userFile = path.join(this.recordingsDir, `${sessionId}_user_${Date.now()}.wav`);
    try { fs.writeFileSync(userFile, audioBuffer); } catch (e) {}

    // 1. STT
    const userText = await this.speechToText(audioBuffer, sessionId);
    
    // Если текст пустой (тишина), не тратим токены на анализ
    if (!userText || userText.trim().length < 2) {
        return { text: "", response: "", audio: null, incident: this.incidentData.get(sessionId) };
    }

    this.logger.log(`[${sessionId}] 📞 Заявитель: ${userText}`);

    const currentIncident = this.incidentData.get(sessionId) || {};

    // 2. Анализ и Ответ (защищенные блоки try-catch)
    let incidentAnalysis = {};
    let dispatcherResponse = "";

    try {
        const results = await Promise.allSettled([
            this.analyzeIncident(userText),
            this.generateDispatcherResponse(userText, sessionId, currentIncident),
        ]);

        if (results[0].status === 'fulfilled') incidentAnalysis = results[0].value;
        if (results[1].status === 'fulfilled') dispatcherResponse = results[1].value;
    } catch (e) {
        this.logger.error("Parallel processing error", e);
    }

    // 3. Обновление данных
    const mergedIncident = this.mergeIncidentData(sessionId, incidentAnalysis);

    // 4. TTS (только если есть ответ)
    let responseAudio: Buffer = null;
    if (dispatcherResponse) {
        responseAudio = await this.textToSpeech(dispatcherResponse);
        // Сохраняем ответ AI
        const aiFile = path.join(this.recordingsDir, `${sessionId}_ai_${Date.now()}.mp3`);
        try { fs.writeFileSync(aiFile, responseAudio); } catch (e) {}
    }

    return {
      text: userText,
      response: dispatcherResponse,
      audio: responseAudio,
      incident: mergedIncident,
    };
  }

  // --- STT ---
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
      // Игнорируем ошибки распознавания (шум)
      return "";
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  // --- Ответ Диспетчера ---
  async generateDispatcherResponse(userMessage: string, sessionId: string, incidentContext: any) {
    try {
        if (!this.dispatcherHistory.has(sessionId)) {
        this.dispatcherHistory.set(sessionId, [
            {
            role: "system",
            content: `Ты — диспетчер 102. Кратко (1-2 фразы). Если критично - наряд выехал. Спроси адрес.`
            }
        ]);
        }
        const history = this.dispatcherHistory.get(sessionId);
        
        let contextInfo = "";
        if (incidentContext?.priority) {
            contextInfo = `[Приоритет: ${incidentContext.priority}]`;
        }

        history.push({ role: "user", content: `${contextInfo} ${userMessage}` });

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o-mini", // Используем mini для скорости
            messages: history,
            max_tokens: 100,
        });

        const response = completion.choices[0].message.content;
        history.push({ role: "assistant", content: response });
        return response;
    } catch (e) {
        this.logger.error("Dispatcher Error", e.message);
        return "Вас плохо слышно, повторите.";
    }
  }

  // --- Анализ ---
  async analyzeIncident(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Верни JSON: { "priority": "critical|high|medium|low", "categoryRu": "string", "address": "string", "erdr_event_description": "string", "callerName": "string" }`
          },
          { role: "user", content: text }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      return {};
    }
  }

  mergeIncidentData(sessionId: string, newData: any) {
    const current = this.incidentData.get(sessionId) || {};
    const merged = { ...current, ...newData };
    Object.keys(merged).forEach(key => {
        if (merged[key] === null || merged[key] === "Не определено") delete merged[key];
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
    } catch (e) {
        return Buffer.from("");
    }
  }

  async endCall(sessionId: string) {
    const data = this.incidentData.get(sessionId);
    if (data) {
        try {
            await this.casesService.createFromCall(
                data.callerPhone || 'Не определен',
                `/recordings/${sessionId}.wav`,
                data.erdr_event_description || 'Голосовой вызов'
            );
        } catch (e) {
            this.logger.error(`Failed to save case`, e);
        }
    }
    this.clearHistory(sessionId);
  }

  clearHistory(sessionId: string) {
    this.conversationHistory.delete(sessionId);
    this.dispatcherHistory.delete(sessionId);
    this.incidentData.delete(sessionId);
  }

  async sendToErdr(sessionId: string) {
    return { success: true };
  }
}