import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VoiceAiService } from './voice-ai.service';
import { randomUUID } from 'crypto';

@WebSocketGateway({ cors: true })
export class VoiceCallGateway {
  @WebSocketServer() server: Server;

  // Хранилище буферов для каждой сессии: sessionId -> Buffer[]
  private sessionBuffers: Map<string, Buffer[]> = new Map();
  // Блокировка обработки для сессии (чтобы не слать параллельные запросы)
  private processingLocks: Map<string, boolean> = new Map();
  // Время последнего обновления (для сброса по тайм-ауту)
  private lastActivity: Map<string, number> = new Map();

  constructor(private readonly voiceAiService: VoiceAiService) {}

  @SubscribeMessage('call-ai')
  handleStartCall(@ConnectedSocket() client: Socket) {
    const sessionId = randomUUID();
    this.sessionBuffers.set(sessionId, []);
    this.processingLocks.set(sessionId, false);
    this.lastActivity.set(sessionId, Date.now());
    
    client.emit('ai-call-started', { sessionId });
    console.log(`Call started: ${sessionId}`);
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(@MessageBody() payload: { audioData: string, sessionId: string }, @ConnectedSocket() client: Socket) {
    const { sessionId, audioData } = payload;
    if (!sessionId || !this.sessionBuffers.has(sessionId)) return;

    // 1. Накапливаем буфер
    const chunk = Buffer.from(audioData, 'base64');
    const currentBuffer = this.sessionBuffers.get(sessionId);
    currentBuffer.push(chunk);
    this.lastActivity.set(sessionId, Date.now());

    // 2. Проверяем размер буфера (например, накопили ~3 секунды аудио)
    // 1 секунда 16kHz 16bit mono = 32kb. 3 сек ~ 100kb.
    const totalLength = currentBuffer.reduce((acc, val) => acc + val.length, 0);
    
    // Если буфер больше 64KB (около 2 секунд) и мы не заняты обработкой
    if (totalLength > 64 * 1024 && !this.processingLocks.get(sessionId)) {
        await this.processBuffer(sessionId, client);
    }
  }

  // Метод обработки накопленного буфера
  private async processBuffer(sessionId: string, client: Socket) {
      // Блокируем сессию
      this.processingLocks.set(sessionId, true);
      
      try {
          // Забираем и склеиваем буфер
          const buffers = this.sessionBuffers.get(sessionId);
          if (!buffers || buffers.length === 0) return;
          
          const fullBuffer = Buffer.concat(buffers);
          // Очищаем буфер для новых данных
          this.sessionBuffers.set(sessionId, []);

          console.log(`[Gateway] Processing buffer size: ${fullBuffer.length} bytes for ${sessionId}`);

          // Отправляем в AI Service
          const result = await this.voiceAiService.processAudio(fullBuffer, sessionId);

          // Отправляем ответ клиенту
          client.emit('ai-response', {
              text: result.text,
              response: result.response,
              audio: result.audio ? result.audio.toString('base64') : null,
              incident: result.incident
          });

      } catch (error) {
          console.error(`Error processing audio for ${sessionId}:`, error.message);
      } finally {
          // Снимаем блокировку
          this.processingLocks.set(sessionId, false);
          
          // Если пока мы обрабатывали, накопился новый ОГРОМНЫЙ буфер - запускаем рекурсивно
          // (но с задержкой, чтобы дать передышку)
          const newBuffers = this.sessionBuffers.get(sessionId);
          const newLength = newBuffers?.reduce((acc, val) => acc + val.length, 0) || 0;
          if (newLength > 128 * 1024) {
             setTimeout(() => this.processBuffer(sessionId, client), 100);
          }
      }
  }

  @SubscribeMessage('end-ai-call')
  handleEndCall(@MessageBody() data: { sessionId: string }) {
      console.log(`Call ended: ${data.sessionId}`);
      this.voiceAiService.endCall(data.sessionId);
      
      // Очистка памяти
      this.sessionBuffers.delete(data.sessionId);
      this.processingLocks.delete(data.sessionId);
      this.lastActivity.delete(data.sessionId);
  }
}