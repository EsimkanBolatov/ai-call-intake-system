import { Module, forwardRef } from '@nestjs/common';
import { VoiceCallGateway } from './voice-call.gateway';
import { VoiceAiService } from './voice-ai.service'; // <-- Импорт
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    forwardRef(() => CasesModule),
  ],
  providers: [VoiceCallGateway, VoiceAiService], // <-- Добавлен в провайдеры
  exports: [VoiceAiService],
  controllers: []
})
export class VoiceCallModule {}