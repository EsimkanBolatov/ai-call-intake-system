import React, { useState, useEffect, useRef } from "react";
import {
  Box, Typography, Paper, Button, Stack, Card, CardContent, Chip
} from "@mui/material";
import { Mic, PhoneDisabled, RecordVoiceOver, SettingsVoice } from "@mui/icons-material";
import { io, Socket } from "socket.io-client";

// Хелперы для WAV
const audioBufferToWav = (buffer: AudioBuffer) => {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * bytesPerSample;
  const bufferLen = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLen);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1]);
      };
      reader.readAsDataURL(blob);
  });
};

const CallSimulator: React.FC = () => {
  // UI States
  const [status, setStatus] = useState<string>("Готов к звонку");
  const [isCalling, setIsCalling] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
  const [incidentData, setIncidentData] = useState<any>(null);
  const [volume, setVolume] = useState(0);

  // Refs for Audio/Socket logic
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null); // <--- FIXED: Use Ref for SessionID
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // VAD Refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    // Инициализация сокета (URL бэкенда)
    socketRef.current = io("http://localhost:3000", { 
        transports: ["websocket"],
        path: "/socket.io/"
    });

    socketRef.current.on("connect", () => console.log("Socket connected"));
    
    // FIXED: Capture session ID from backend
    socketRef.current.on("ai-call-started", (data: { sessionId: string }) => {
        console.log("Call Started, Session ID:", data.sessionId);
        sessionIdRef.current = data.sessionId; 
        setStatus("🟢 Соединение установлено. Говорите...");
        setIsCalling(true);
        startListening();
    });

    socketRef.current.on("ai-response", (data) => {
        setStatus("🤖 AI отвечает...");
        
        // Добавляем в чат
        setTranscript(prev => [
            ...prev, 
            { role: 'user', text: data.text },
            { role: 'ai', text: data.response }
        ]);

        if (data.incident) setIncidentData(data.incident);

        // Воспроизведение аудио
        if (data.audio) {
            const audioSrc = `data:audio/mp3;base64,${data.audio}`;
            if (aiAudioRef.current) {
                aiAudioRef.current.src = audioSrc;
                aiAudioRef.current.play();
                aiAudioRef.current.onended = () => {
                   setStatus("🎙️ Слушаю...");
                };
            }
        }
    });

    return () => {
        socketRef.current?.disconnect();
        stopAudio();
    };
  }, []);

  const startCall = async () => {
    try {
        setStatus("⏳ Подключение...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { sampleRate: 16000, echoCancellation: true } 
        });
        mediaStreamRef.current = stream;

        // Отправка события начала звонка с DeviceInfo
        const deviceInfo = {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
        socketRef.current?.emit("call-ai", { deviceInfo });

    } catch (err) {
        console.error(err);
        setStatus("❌ Ошибка доступа к микрофону");
    }
  };

  const startListening = async () => {
      if (!mediaStreamRef.current) return;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      try {
        await ctx.audioWorklet.addModule('/audio-processor.js'); 
      } catch (e) {
        console.error("Failed to load audio-processor.js. Ensure it exists in /public folder.", e);
        setStatus("❌ Ошибка: audio-processor не найден");
        return;
      }
      
      const source = ctx.createMediaStreamSource(mediaStreamRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const processor = new AudioWorkletNode(ctx, 'audio-recorder-processor');
      processorRef.current = processor;

      processor.port.onmessage = (e) => {
          if (e.data.type === 'audioChunk' && isSpeakingRef.current) {
              audioChunksRef.current.push(e.data.chunk);
          }
      };

      source.connect(analyser);
      source.connect(processor);
      processor.connect(ctx.destination); 

      detectVoiceActivity();
  };

  const detectVoiceActivity = () => {
      // Check if call is still active
      if (!analyserRef.current || !mediaStreamRef.current?.active) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      let sum = 0;
      for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;
      setVolume(avg);

      const THRESHOLD = 15; // Decreased threshold slightly for better sensitivity

      if (avg > THRESHOLD) {
          if (!isSpeakingRef.current) {
              console.log("🗣️ Speech started");
              isSpeakingRef.current = true;
              setIsRecording(true);
              audioChunksRef.current = [];
              processorRef.current?.port.postMessage({ type: 'startRecording' });
              
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          }
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
      } else {
          if (isSpeakingRef.current && !silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                  console.log("🤫 Silence detected, sending...");
                  stopRecordingAndSend();
              }, 1200); // Increased silence wait slightly
          }
      }

      requestAnimationFrame(detectVoiceActivity);
  };

  const stopRecordingAndSend = async () => {
      isSpeakingRef.current = false;
      setIsRecording(false);
      processorRef.current?.port.postMessage({ type: 'stopRecording' });
      
      // Clear silence timer ref so it can trigger again next time
      silenceTimerRef.current = null;

      if (audioChunksRef.current.length === 0) return;

      console.log(`Sending ${audioChunksRef.current.length} chunks...`);

      const flat = new Float32Array(audioChunksRef.current.reduce((acc, val) => acc + val.length, 0));
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
          flat.set(chunk, offset);
          offset += chunk.length;
      }
      
      const audioBuffer = audioContextRef.current!.createBuffer(1, flat.length, 16000);
      audioBuffer.copyToChannel(flat, 0);
      
      const wavBlob = audioBufferToWav(audioBuffer);
      const base64 = await blobToBase64(wavBlob);

      // FIXED: Use the correct sessionIdRef
      if (sessionIdRef.current && socketRef.current) {
        socketRef.current.emit("audio-chunk", {
            sessionId: sessionIdRef.current, 
            audioData: base64
        });
      } else {
          console.warn("Session ID or Socket missing");
      }
      
      audioChunksRef.current = [];
  };

  const stopAudio = () => {
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsCalling(false);
      // Don't clear transcript to allow user to read it
      // setTranscript([]); 
      // setIncidentData(null);
      isSpeakingRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };

  const handleEndCall = () => {
      if (sessionIdRef.current && socketRef.current) {
        socketRef.current.emit("end-ai-call", { sessionId: sessionIdRef.current }); 
      }
      stopAudio();
      setStatus("Звонок завершен");
      sessionIdRef.current = null;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>📞 NG911 Голосовой Терминал</Typography>
      
      <Paper sx={{ p: 3, mb: 3, textAlign: 'center', background: isCalling ? '#e3f2fd' : '#fff' }}>
        <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
            <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: isRecording ? '#ef5350' : '#2196f3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 ${volume * 2}px ${isRecording ? 'red' : 'blue'}` // Increased visual feedback
            }}>
                {isRecording ? <RecordVoiceOver style={{ fontSize: 50, color: 'white' }} /> : <Mic style={{ fontSize: 50, color: 'white' }} />}
            </div>
        </Box>
        
        <Typography variant="h6" gutterBottom>{status}</Typography>

        <Stack direction="row" spacing={2} justifyContent="center" mt={2}>
            {!isCalling ? (
                <Button variant="contained" size="large" color="primary" startIcon={<SettingsVoice />} onClick={startCall}>
                    Начать звонок
                </Button>
            ) : (
                <Button variant="contained" size="large" color="error" startIcon={<PhoneDisabled />} onClick={handleEndCall}>
                    Завершить
                </Button>
            )}
        </Stack>
      </Paper>

      {/* Transcript Area */}
      <Paper sx={{ p: 2, height: 300, overflowY: 'auto', mb: 3, bgcolor: '#f5f5f5' }}>
          {transcript.length === 0 && <Typography color="text.secondary" align="center">История пуста...</Typography>}
          {transcript.map((msg, i) => (
              <Box key={i} sx={{ 
                  display: 'flex', 
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1 
              }}>
                  <Paper sx={{ 
                      p: 1.5, 
                      bgcolor: msg.role === 'user' ? '#1976d2' : '#fff',
                      color: msg.role === 'user' ? '#fff' : '#000',
                      maxWidth: '80%'
                  }}>
                      <Typography variant="body1">{msg.text}</Typography>
                  </Paper>
              </Box>
          ))}
      </Paper>

      {/* Incident Data Card */}
      {incidentData && (
          <Card variant="outlined">
              <CardContent>
                  <Typography variant="h6" gutterBottom>📋 Данные ЕРДР (Live)</Typography>
                  <Stack direction="row" spacing={1} mb={1}>
                      <Chip label={incidentData.priority?.toUpperCase()} color={incidentData.priority === 'critical' ? 'error' : 'warning'} />
                      <Chip label={incidentData.categoryRu} />
                  </Stack>
                  <Typography><b>Район:</b> {incidentData.erdr_district}</Typography>
                  <Typography><b>Служба:</b> {incidentData.dispatchToRu}</Typography>
              </CardContent>
          </Card>
      )}

      {/* Hidden Audio Player */}
      <audio ref={aiAudioRef} style={{ display: 'none' }} />
    </Box>
  );
};

export default CallSimulator;