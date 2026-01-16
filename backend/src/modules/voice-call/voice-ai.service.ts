import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VoiceAiService {
  private readonly logger = new Logger(VoiceAiService.name);
  private readonly aiModuleUrl = 'http://localhost:8001'; // Python Module
  private readonly erdrServiceUrl = 'http://127.0.0.1:8000'; // Django/FastAPI ERDR
  
  // Храним историю диалогов в памяти (в продакшене лучше Redis)
  private sessionHistory: Map<string, any[]> = new Map();

  async processAudio(audioBuffer: Buffer, sessionId: string, metadata: any) {
    try {
      const base64Audio = audioBuffer.toString('base64');
      const history = this.sessionHistory.get(sessionId) || [];

      // 1. Запрос к AI модулю (Python)
      const response = await axios.post(`${this.aiModuleUrl}/process-call`, {
        sessionId: sessionId,
        audioData: base64Audio,
        sampleRate: metadata.sampleRate || 16000,
        history: history
      });

      const { userText, responseText, audioBase64, incident } = response.data;

      if (!userText) return { text: '', response: '' };

      // 2. Обновляем историю
      history.push({ role: 'user', content: userText });
      history.push({ role: 'assistant', content: responseText });
      this.sessionHistory.set(sessionId, history);

      // 3. ОТПРАВКА В ЕРДР (Если есть полезные данные)
      if (incident && (incident.address || incident.type !== 'Unknown')) {
          this.sendToErdr(sessionId, incident, userText);
      }

      return {
        text: userText,
        response: responseText,
        audio: audioBase64,
        incident: incident
      };

    } catch (error) {
      this.logger.error(`[${sessionId}] AI Module request failed: ${error.message}`);
      throw error;
    }
  }

  // Метод отправки в ЕРДР
  private async sendToErdr(sessionId: string, incident: any, rawText: string) {
      try {
          // Формируем JSON, который ждет твой ERDR сервис
          const payload = {
              source: "voice_ai_112",
              call_id: sessionId,
              text_summary: rawText,
              predicted_category: incident.type,
              detected_address: incident.address,
              priority: incident.priority,
              status: "active"
          };

          this.logger.log(`[${sessionId}] 🚀 Sending to ERDR: ${JSON.stringify(payload)}`);
          
          // Отправляем POST (fire and forget - не ждем ответа, чтобы не тормозить голос)
          axios.post(`${this.erdrServiceUrl}/api/incidents/create`, payload) // <-- Проверь этот путь в Django!
               .catch(e => this.logger.warn(`ERDR Error: ${e.message}`));

      } catch (e) {
          this.logger.warn(`Failed to prepare ERDR payload`);
      }
  }

  endCall(sessionId: string) {
      this.sessionHistory.delete(sessionId);
      this.logger.log(`Session ${sessionId} cleared`);
  }
}