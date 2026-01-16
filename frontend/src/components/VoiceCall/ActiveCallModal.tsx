import React, { useEffect, useRef, useState } from 'react';
import { 
    Dialog, DialogContent, DialogTitle, IconButton, Typography, 
    Box, Chip, Stack, Button 
} from '@mui/material';
import { Close, Mic, SupportAgent, PriorityHigh } from '@mui/icons-material';
import { io, Socket } from 'socket.io-client'; // Исправлен импорт

interface ActiveCallModalProps {
    open: boolean;
    onClose: () => void;
}

// Интерфейсы для данных от сокета
interface AiResponseData {
    text: string;
    response: string;
    audio: string;
    incident?: any;
}

interface CallStartedData {
    sessionId: string;
}

// URL бэкенда (убедитесь, что порт совпадает с backend/main.ts, обычно 8080 или 3000)
const SOCKET_URL = 'http://localhost:3000'; 

const ActiveCallModal: React.FC<ActiveCallModalProps> = ({ open, onClose }) => {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
    const [incidentData, setIncidentData] = useState<any>({});
    const [status, setStatus] = useState('Подключение...');
    
    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        if (open) {
            startCall();
        } else {
            cleanup();
        }
        return () => cleanup();
    }, [open]);

    const startCall = async () => {
        try {
            // 1. Socket Connection
            socketRef.current = io(SOCKET_URL);
            
            socketRef.current.on('connect', () => {
                setStatus('Связь установлена. Начинаю вызов...');
                socketRef.current?.emit('call-ai', {});
            });

            // ИСПРАВЛЕНИЕ: Типизация входящих данных
            socketRef.current.on('ai-call-started', ({ sessionId }: CallStartedData) => {
                setSessionId(sessionId);
                setStatus('Говорите... (Запись идет)');
                initAudio(sessionId);
            });

            // ИСПРАВЛЕНИЕ: Типизация входящих данных
            socketRef.current.on('ai-response', (data: AiResponseData) => {
                // Воспроизведение аудио ответа
                if (data.audio) {
                    playAudioResponse(data.audio);
                }
                
                // Обновление транскрипта
                setTranscript(prev => [
                    ...prev, 
                    { role: 'user', text: data.text },
                    { role: 'ai', text: data.response }
                ]);

                // Обновление данных инцидента
                if (data.incident) {
                    setIncidentData(data.incident);
                }
            });

        } catch (e) {
            console.error(e);
            setStatus('Ошибка подключения');
        }
    };

    const initAudio = async (sid: string) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            // @ts-ignore - window.AudioContext или window.webkitAudioContext
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass({ sampleRate: 16000 }); 
            audioContextRef.current = audioContext;

            await audioContext.audioWorklet.addModule('/audio-processor.js');
            
            const source = audioContext.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(audioContext, 'audio-recorder-processor');
            
            worklet.port.onmessage = (event) => {
                if (event.data.type === 'audioChunk' && socketRef.current) {
                    const float32 = event.data.chunk;
                    const buffer = float32To16BitPCM(float32);
                    const base64 = arrayBufferToBase64(buffer);
                    
                    socketRef.current.emit('audio-chunk', {
                        audioData: base64,
                        sessionId: sid
                    });
                }
            };

            source.connect(worklet);
            worklet.connect(audioContext.destination); 
            worklet.port.postMessage({ type: 'startRecording' });
            
            workletNodeRef.current = worklet;

        } catch (err) {
            console.error("Audio init error", err);
            setStatus('Ошибка доступа к микрофону');
        }
    };

    const playAudioResponse = async (base64Audio: string) => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioContextClass();
            const arrayBuffer = base64ToArrayBuffer(base64Audio);
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.start(0);
        } catch (e) {
            console.error("Audio playback error", e);
        }
    };

    const cleanup = () => {
        if (socketRef.current) {
            if (sessionId) socketRef.current.emit('end-ai-call', { sessionId });
            socketRef.current.disconnect();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        setTranscript([]);
        setIncidentData({});
        setSessionId(null);
    };

    // --- Helpers ---
    const float32To16BitPCM = (float32Arr: Float32Array) => {
        const buffer = new ArrayBuffer(float32Arr.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Arr.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Arr[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    const base64ToArrayBuffer = (base64: string) => {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f5f5f5' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <SupportAgent color="primary" />
                    Активный звонок 102 (AI Ассистент)
                </Box>
                <IconButton onClick={onClose}><Close /></IconButton>
            </DialogTitle>
            
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={3}>
                    {/* Status Bar */}
                    <Box sx={{ p: 2, bgcolor: '#e3f2fd', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Mic color={sessionId ? "error" : "disabled"} className={sessionId ? "pulse" : ""} />
                            <Typography variant="subtitle1" fontWeight="bold">
                                {status}
                            </Typography>
                        </Box>
                        {sessionId && <Chip label={`Session: ${sessionId.slice(0,8)}`} size="small" />}
                    </Box>

                    {/* Live Data Cards */}
                    <Stack direction="row" spacing={2}>
                        <Box flex={1} p={2} border="1px solid #ddd" borderRadius={2}>
                             <Typography variant="caption" color="textSecondary">Категория</Typography>
                             <Typography variant="h6">{incidentData.categoryRu || "Определение..."}</Typography>
                        </Box>
                        <Box flex={1} p={2} border="1px solid #ddd" borderRadius={2} bgcolor={incidentData.priority === 'critical' ? '#ffebee' : 'transparent'}>
                             <Typography variant="caption" color="textSecondary">Приоритет</Typography>
                             <Stack direction="row" alignItems="center" gap={1}>
                                {incidentData.priority === 'critical' && <PriorityHigh color="error"/>}
                                <Typography variant="h6">{incidentData.priority || "Оценка..."}</Typography>
                             </Stack>
                        </Box>
                        <Box flex={1} p={2} border="1px solid #ddd" borderRadius={2}>
                             <Typography variant="caption" color="textSecondary">Адрес</Typography>
                             <Typography variant="body1">{incidentData.address || "..."}</Typography>
                        </Box>
                    </Stack>

                    {/* Transcript Chat */}
                    <Box sx={{ height: 300, overflowY: 'auto', border: '1px solid #eee', borderRadius: 2, p: 2, bgcolor: '#fafafa' }}>
                        {transcript.length === 0 && <Typography color="textSecondary" align="center">Ожидание речи...</Typography>}
                        {transcript.map((msg, idx) => (
                            <Box key={idx} sx={{ 
                                display: 'flex', 
                                justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end',
                                mb: 1 
                            }}>
                                <Box sx={{ 
                                    p: 1.5, 
                                    borderRadius: 2, 
                                    bgcolor: msg.role === 'user' ? '#fff' : '#e8eaf6',
                                    border: '1px solid #eee',
                                    maxWidth: '80%'
                                }}>
                                    <Typography variant="caption" display="block" color="textSecondary">
                                        {msg.role === 'user' ? 'Заявитель' : 'Диспетчер'}
                                    </Typography>
                                    <Typography variant="body1">{msg.text}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                    
                    <Button variant="contained" color="error" fullWidth size="large" onClick={onClose}>
                        Завершить вызов и создать карточку
                    </Button>
                </Stack>
            </DialogContent>
        </Dialog>
    );
};

export default ActiveCallModal;