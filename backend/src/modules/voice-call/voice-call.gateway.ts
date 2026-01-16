import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VoiceAiService } from './voice-ai.service';
import { randomUUID } from 'crypto';

@WebSocketGateway({ cors: true })
export class VoiceCallGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // Хранилище буферов: sessionId -> Buffer[]
  private sessionBuffers: Map<string, Buffer[]> = new Map();
  // Таймеры сброса для каждой сессии
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  // Метаданные аудио
  private sessionMetadata: Map<string, { sampleRate: number, channels: number }> = new Map();

  constructor(private readonly voiceAiService: VoiceAiService) {}

  @SubscribeMessage('call-ai')
  async handleStartCall(
    @MessageBody() data: { deviceInfo: any }, // Обновленная сигнатура
    @ConnectedSocket() client: Socket
  ) {
    const sessionId = randomUUID();
    this.sessionBuffers.set(sessionId, []);
    
    // Логируем или сохраняем Device Info
    console.log(`[Gateway] Call started: ${sessionId}`);
    if (data && data.deviceInfo) {
        console.log(`[Gateway] Device Info:`, data.deviceInfo);
        // TODO: Вызвать this.casesService.createEmptyCaseWithInfo(sessionId, data.deviceInfo)
        // Но для MVP достаточно передать это в voiceAiService.startSession(sessionId, data.deviceInfo)
    }
    
    // Инициализируем сессию в сервисе (если метод существует)
    // await this.voiceAiService.startSession(sessionId, data?.deviceInfo);

    client.emit('ai-call-started', { sessionId });
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(@MessageBody() payload: { audioData: string, sessionId: string, sampleRate?: number, channels?: number }, @ConnectedSocket() client: Socket) {
    const { sessionId, audioData, sampleRate = 16000, channels = 1 } = payload;
    if (!sessionId) return;

    // 1. Инициализация буфера, если нет
    if (!this.sessionBuffers.has(sessionId)) {
        this.sessionBuffers.set(sessionId, []);
        this.sessionMetadata.set(sessionId, { sampleRate, channels });
    }

    // 2. Добавляем данные
    const chunk = Buffer.from(audioData, 'base64');
    this.sessionBuffers.get(sessionId).push(chunk);

    // 3. Сбрасываем старый таймер (debounce)
    if (this.flushTimers.has(sessionId)) {
        clearTimeout(this.flushTimers.get(sessionId));
    }

    // 4. Логика отправки:
    // Если буфер накопился достаточно большим (> 32KB ~ 1 сек), отправляем сразу
    const currentBufferSize = this.sessionBuffers.get(sessionId).reduce((acc, val) => acc + val.length, 0);
    
    if (currentBufferSize > 32 * 1024) {
        await this.flushBuffer(sessionId, client);
    } else {
        // Иначе ждем 1.5 секунды тишины/паузы и отправляем
        const timer = setTimeout(() => {
            this.flushBuffer(sessionId, client);
        }, 1500); 
        this.flushTimers.set(sessionId, timer);
    }
  }

  private async flushBuffer(sessionId: string, client: Socket) {
      if (!this.sessionBuffers.has(sessionId)) return;
      
      const buffers = this.sessionBuffers.get(sessionId);
      if (buffers.length === 0) return;

      // Склеиваем и очищаем СРАЗУ, чтобы новые данные шли в новый пакет
      const fullBuffer = Buffer.concat(buffers);
      const metadata = this.sessionMetadata.get(sessionId) || { sampleRate: 16000, channels: 1 };
      this.sessionBuffers.set(sessionId, []); 

      console.log(`[Gateway] Processing buffer: ${fullBuffer.length} bytes for ${sessionId}`);

      try {
          const result = await this.voiceAiService.processAudio(fullBuffer, sessionId, metadata);

          client.emit('ai-response', {
              text: result.text,
              response: result.response,
              audio: result.audio ? result.audio.toString('base64') : null,
              incident: result.incident
          });
      } catch (e) {
          console.error(`[Gateway] Error processing audio: ${e.message}`);
      }
  }

  @SubscribeMessage('end-ai-call')
  handleEndCall(@MessageBody() data: { sessionId: string }) {
      console.log(`[Gateway] Ending call: ${data.sessionId}`);
      this.cleanupSession(data.sessionId);
      this.voiceAiService.endCall(data.sessionId);
  }

  handleDisconnect(client: Socket) {
      // Можно добавить логику очистки по socketId, если нужно
  }

  private cleanupSession(sessionId: string) {
      if (this.flushTimers.has(sessionId)) {
          clearTimeout(this.flushTimers.get(sessionId));
          this.flushTimers.delete(sessionId);
      }
      this.sessionBuffers.delete(sessionId);
  }
}