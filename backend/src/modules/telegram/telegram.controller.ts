import { Controller, Post, Body, Logger } from "@nestjs/common";
import { TelegramService } from "./telegram.service";

@Controller("telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  @Post("webhook")
  async handleWebhook(@Body() update: any) {
    this.logger.debug(`Webhook received: ${JSON.stringify(update)}`);
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
