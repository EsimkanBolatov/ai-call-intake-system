import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai: OpenAI;
  private logger = new Logger(AiService.name);
  
  // Хранилище контекста диалогов (в памяти, как в прототипе)
  private dispatcherHistory: Map<string, any[]> = new Map();

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 30000,
    });
  }

  /**
   * 1. Генерация ответа диспетчера (Persona 102/112)
   */
  async generateDispatcherResponse(
    userMessage: string, 
    sessionId: string, 
    incidentContext: any = null
  ): Promise<string> {
    try {
      // Инициализация истории, если её нет
      if (!this.dispatcherHistory.has(sessionId)) {
        this.dispatcherHistory.set(sessionId, [
          {
            role: "system",
            content: `Ты — диспетчер экстренных служб 102 (полиция).
Твоя задача — профессионально общаться с заявителем.

ПРИНЦИПЫ:
1.  **ПРИОРИТЕТ ЖИЗНИ**: Если угроза жизни, оружие или насилие — СРАЗУ отправляй наряд. Не задавай лишних вопросов.
2.  **АДАПТИВНОСТЬ**:
    * **CRITICAL / HIGH** (Убийство, нападение, ДТП с жертвами):
        - Спрашивай ТОЛЬКО: "ГДЕ?" и "ЕСТЬ ЛИ ОРУЖИЕ/УГРОЗА?"
        - Сразу говори: "Наряд выехал. Оставайтесь на линии."
    * **MEDIUM / LOW** (Шум, кража, справочная):
        - Действуй по протоколу: Что случилось? Где? Кто звонит? Детали.
        - Будь вежлив, но краток.

3.  **СТИЛЬ ОБЩЕНИЯ**:
    - Говори КРАТКО (макс. 2 предложения).
    - Успокаивай паникеров ("Помощь уже едет, я с вами").
    - Четкие команды ("Говорите адрес", "Отойдите в безопасное место").

4. **СБОР ДАННЫХ**:
    - Обязательно узнай **Имя и Фамилию** заявителя, если ситуация позволяет.`
          },
        ]);
      }

      const history = this.dispatcherHistory.get(sessionId);

      // Формирование контекстного сообщения (если есть данные из CAD/анализа)
      let contextMessage = userMessage;
      if (incidentContext) {
        const urgency = (incidentContext.priority === 'critical' || incidentContext.priority === 'high')
            ? `[КРИТИЧЕСКИЙ ПРИОРИТЕТ! ЭМОЦИИ: ${incidentContext.emotion}. СОКРАТИ ВОПРОСЫ!]`
            : `[Приоритет: ${incidentContext.priority || 'обычный'}]`;
        
        const knownData = [];
        if (incidentContext.address) knownData.push(`АДРЕС ЕСТЬ: ${incidentContext.address}`);
        else knownData.push("АДРЕСА НЕТ (спроси!)");

        contextMessage = `${urgency}\n[Известно: ${knownData.join(', ')}]\n\nЗаявитель: ${userMessage}`;
      }

      history.push({ role: "user", content: contextMessage });

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: history,
        max_tokens: 150, // Краткий ответ
        temperature: 0.5,
      });

      const aiResponse = completion.choices[0].message.content;
      history.push({ role: "assistant", content: aiResponse });

      // Ограничение истории (последние 20 сообщений)
      if (history.length > 22) {
          const systemMsg = history[0];
          this.dispatcherHistory.set(sessionId, [systemMsg, ...history.slice(-20)]);
      }

      return aiResponse;
    } catch (e) {
      this.logger.error("Error generating dispatcher response", e);
      return "Служба 102. Говорите, я вас слышу."; // Fallback
    }
  }

  /**
   * 2. Анализ для ЕРДР (Smart Triage & JSON Extraction)
   */
  async analyzeIncidentForErdr(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты аналитик экстренных вызовов для полиции Казахстана.
Твоя задача — извлечь данные и вернуть ТОЛЬКО JSON для регистрации в ЕРДР.

Структура JSON:
{
  "priority": "critical|high|medium|low",
  "priorityEmoji": "🔴|🟠|🟡|🟢",
  "categoryRu": "убийство|грабеж|дтп|бытовой_конфликт|мошенничество|справочный|пожар|здоровье|другое",
  "dispatchToRu": "Полиция|Скорая|МЧС|Газ|Участковый|Справочная",
  "emotion": "паника|агрессия|шок|страх|спокойствие",
  "address": "адрес или null",
  "callerName": "ФИО или null",
  "needsClarification": ["список вопросов"],

  // --- ПОЛЯ ДЛЯ ЕРДР ---
  "erdr_district": "Дефолт: 'Заводской район'. Или 'Алматинский район', 'ДП Жамбылской области'.",
  "erdr_event_description": "Сухая юридическая фабула (3-4 предложения).",
  "field_5_1": "Классификатор: 'против собственности', 'против личности', 'прочие', 'общественная безопасность'.",
  "field_5_6": "Интернет-мошенничество? 'Да' или 'Нет'."
}`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      });
      
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      this.logger.error("Incident analysis failed", e);
      return { priority: "medium", categoryRu: "Не определено", erdr_district: "Заводской район" };
    }
  }

  // Очистка истории при завершении звонка
  clearSession(sessionId: string) {
      this.dispatcherHistory.delete(sessionId);
  }
  
  // Методы TTS/STT остаются или импортируются из VoiceAiService, 
  // но для чистоты AI логики они могут быть здесь, если VoiceAiService их делегирует.
  // (В вашем текущем коде они, вероятно, реализованы в VoiceAiService или через REST API, 
  //  как в CasesService. Здесь мы фокусируемся на AI Persona).
}