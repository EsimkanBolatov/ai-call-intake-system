import { Injectable, Logger } from "@nestjs/common";
import { CasesService } from "../cases/cases.service";
import axios from "axios";

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

  constructor(private readonly casesService: CasesService) {}

  async handleUpdate(update: any) {
    this.logger.debug(`Received update: ${JSON.stringify(update)}`);
    const message = update.message || update.channel_post;
    if (!message) {
      return;
    }

    const text = message.text;
    const chatId = message.chat.id;
    const from =
      message.from?.username || message.from?.first_name || "Unknown";

    if (!text) {
      return;
    }

    // Create a case from the message
    try {
      const newCase = await this.casesService.create({
        title: `Telegram appeal from ${from}`,
        description: text,
        status: "new",
      });
      this.logger.log(`Case created: ${newCase.id}`);

      // Optionally send a confirmation to Telegram
      await this.sendMessage(
        chatId,
        `Ваше обращение зарегистрировано под номером ${newCase.id}.`
      );
    } catch (error) {
      this.logger.error(`Failed to create case: ${error.message}`);
    }
  }

  async sendMessage(chatId: number, text: string) {
    if (!this.botToken) {
      this.logger.warn("Telegram bot token not set, skipping send.");
      return;
    }
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: chatId,
          text,
        }
      );
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
    }
  }

  async setWebhook(url: string) {
    if (!this.botToken) {
      throw new Error("Telegram bot token not set");
    }
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${this.botToken}/setWebhook`,
        {
          url,
        }
      );
      this.logger.log(`Webhook set: ${response.data.description}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to set webhook: ${error.message}`);
      throw error;
    }
  }
}
