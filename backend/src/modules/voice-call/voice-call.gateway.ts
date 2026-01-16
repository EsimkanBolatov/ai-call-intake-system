import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VoiceAiService } from './voice-ai.service';
import { randomUUID } from 'crypto';

@WebSocketGateway({ cors: true })
export class VoiceCallGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly voiceAiService: VoiceAiService) {}

  @SubscribeMessage('call-ai')
  handleStartCall(@ConnectedSocket() client: Socket) {
    const sessionId = randomUUID();
    client.emit('ai-call-started', { sessionId });
    console.log(`Call started: ${sessionId}`);
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(@MessageBody() payload: { audioData: string, sessionId: string }, @ConnectedSocket() client: Socket) {
    if (!payload.sessionId) return;
    
    const buffer = Buffer.from(payload.audioData, 'base64');
    
    // Обработка
    const result = await this.voiceAiService.processAudio(buffer, payload.sessionId);
    
    // Ответ клиенту
    client.emit('ai-response', {
        text: result.text,
        response: result.response,
        audio: result.audio.toString('base64'),
        incident: result.incident
    });
  }

  @SubscribeMessage('end-ai-call')
  handleEndCall(@MessageBody() data: { sessionId: string }) {
      console.log(`Call ended: ${data.sessionId}`);
      this.voiceAiService.endCall(data.sessionId);
  }
}