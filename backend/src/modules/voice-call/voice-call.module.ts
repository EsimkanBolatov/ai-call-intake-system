import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VoiceAiService } from './voice-ai.service';
import { VoiceCallGateway } from './voice-call.gateway';
import { VoiceCallController } from './voice-call.controller';
import { CasesModule } from '../cases/cases.module'; // Подключаем модуль кейсов

@Module({
  imports: [
    ConfigModule, 
    forwardRef(() => CasesModule) // Чтобы сохранять кейсы
  ],
  providers: [VoiceAiService, VoiceCallGateway],
  controllers: [VoiceCallController],
  exports: [VoiceAiService],
})
export class VoiceCallModule {}