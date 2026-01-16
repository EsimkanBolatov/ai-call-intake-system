import { Controller, Post, Param } from '@nestjs/common';
import { VoiceAiService } from './voice-ai.service';

@Controller('api/erdr')
export class VoiceCallController {
    constructor(private readonly voiceAiService: VoiceAiService) {}

    @Post('send/:sessionId')
    async sendToErdr(@Param('sessionId') sessionId: string) {
        return this.voiceAiService.sendToErdr(sessionId);
    }
}