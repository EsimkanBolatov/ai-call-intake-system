import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';

@Injectable()
export class AiService {
  private openai: OpenAI;
  private logger = new Logger(AiService.name);

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      timeout: 30000, // Увеличиваем таймаут до 30 секунд
    });
  }

  async classifyText(text: string) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты диспетчер экстренной службы. Проанализируй текст и верни JSON.
            Формат ответа:
            {
              "categories": ["категория (пожар, кража, дтп, и т.д.)"],
              "priority": "high/medium/low",
              "serviceType": "police/fire/ambulance/emergency/other",
              "emotion": "спокойный/паника/агрессия",
              "keywords": ["ключевое", "слово"]
            }`
          },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      });
      
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      this.logger.error("Text classification failed", e);
      // Возвращаем дефолтные значения при ошибке
      return {
          categories: ["не определено"],
          priority: "low",
          serviceType: "other",
          emotion: "neutral",
          keywords: []
      };
    }
  }

  async transcribeAudio(file: Express.Multer.File) {
    // Простейшая реализация, если файл приходит через FormData
    // В реальном проекте нужно сохранить файл во временную папку, затем отправить в OpenAI
    return { text: "Транскрипция пока не реализована в AiService (используйте VoiceCall)" };
  }
}