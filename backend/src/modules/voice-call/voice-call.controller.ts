import { Controller } from '@nestjs/common';
import { VoiceAiService } from './voice-ai.service';

@Controller('api/voice-call')
export class VoiceCallController {
    constructor(private readonly voiceAiService: VoiceAiService) {}

}