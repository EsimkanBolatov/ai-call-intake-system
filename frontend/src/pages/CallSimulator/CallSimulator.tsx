import React, { useState, useEffect, useRef } from "react";
import {
  Box, Typography, Paper, Button, Stack, Card, CardContent, Chip, LinearProgress
} from "@mui/material";
import { Mic, PhoneDisabled, RecordVoiceOver, SettingsVoice } from "@mui/icons-material";
import { io, Socket } from "socket.io-client";

// Вспомогательная функция
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const CallSimulator: React.FC = () => {
  // UI States
  const [status, setStatus] = useState<string>("Готов к звонку");
  const [isCalling, setIsCalling] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
  const [incidentData, setIncidentData] = useState<any>(null);
  const [volume, setVolume] = useState(0);
  const [thresholdDisplay, setThresholdDisplay] = useState(0);
  const [calibrating, setCalibrating] = useState(false);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // VAD Refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // NEW: Таймер макс. длительности
  const isSpeakingRef = useRef(false);
  const noiseLevelRef = useRef(10); // Default safety threshold
  const calibrationSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    socketRef.current = io("http://localhost:3000", { 
        transports: ["websocket"],
        path: "/socket.io/"
    });

    socketRef.current.on("connect", () => console.log("Socket connected"));
    
    socketRef.current.on("ai-call-started", (data: { sessionId: string }) => {
        console.log("Call Started, Session ID:", data.sessionId);
        sessionIdRef.current = data.sessionId; 
        setStatus("🟢 Соединение установлено. Говорите...");
        setIsCalling(true);
        startListening();
    });

    socketRef.current.on("ai-response", (data) => {
        setStatus("🤖 AI отвечает...");
        
        setTranscript(prev => [
            ...prev, 
            { role: 'user', text: data.text },
            { role: 'ai', text: data.response }
        ]);

        if (data.incident) setIncidentData(data.incident);

        if (data.audio) {
            const audioSrc = `data:audio/mp3;base64,${data.audio}`;
            if (aiAudioRef.current) {
                aiAudioRef.current.src = audioSrc;
                aiAudioRef.current.play();
                aiAudioRef.current.onended = () => {
                   setStatus("🎙️ Слушаю...");
                   // После ответа AI можно немного поднять порог временно, чтобы не ловить эхо
                };
            }
        } else {
            setStatus("🎙️ Слушаю...");
        }
    });

    return () => {
        socketRef.current?.disconnect();
        stopAudio();
    };
  }, []);

  const calibrateNoiseLevel = () => {
    return new Promise<void>((resolve) => {
      setCalibrating(true);
      setStatus("🤫 ТИШИНА! Калибровка шума...");
      calibrationSamplesRef.current = [];
      
      const calibrate = () => {
        if (!analyserRef.current) return;
        
        const bufferLength = analyserRef.current.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const val = (dataArray[i] - 128) / 128;
            sum += val * val;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const currentVol = rms * 100;
        
        calibrationSamplesRef.current.push(currentVol);
        setVolume(currentVol); // Visual feedback
        
        if (calibrationSamplesRef.current.length >= 60) { // ~1 sec
          const avgNoise = calibrationSamplesRef.current.reduce((a, b) => a + b) / calibrationSamplesRef.current.length;
          
          // ИЗМЕНЕНИЕ: Жесткий минимум 10. Если шум 0.5, порог будет 10. Если шум 8, порог 13.
          const calculatedThreshold = Math.max(avgNoise + 5, 10);
          
          noiseLevelRef.current = calculatedThreshold;
          setThresholdDisplay(calculatedThreshold);
          
          console.log(`[Calibration] Avg Noise: ${avgNoise.toFixed(2)}, Set Threshold: ${calculatedThreshold}`);
          setCalibrating(false);
          setStatus("🎙️ Слушаю...");
          resolve();
        } else {
          requestAnimationFrame(calibrate);
        }
      };
      
      calibrate();
    });
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

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
        console.error("Failed to load audio-processor.js", e);
        return;
      }
      
      const source = ctx.createMediaStreamSource(mediaStreamRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // 512 bins
      analyser.smoothingTimeConstant = 0.3;
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

      await calibrateNoiseLevel();
      detectVoiceActivity();
  };

  const detectVoiceActivity = () => {
      if (!analyserRef.current || !mediaStreamRef.current?.active) return;

      const bufferLength = analyserRef.current.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i] - 128) / 128; 
          sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const currentVol = rms * 100; 
      setVolume(currentVol);

      const THRESHOLD = noiseLevelRef.current;

      if (currentVol > THRESHOLD) {
          if (!isSpeakingRef.current) {
              console.log("🗣️ Speech started (Vol: " + currentVol.toFixed(1) + ")");
              isSpeakingRef.current = true;
              setIsRecording(true);
              audioChunksRef.current = [];
              processorRef.current?.port.postMessage({ type: 'startRecording' });
              
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

              // ИЗМЕНЕНИЕ: Предохранитель. Если говорим > 7 сек, останавливаем принудительно.
              if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
              maxDurationTimerRef.current = setTimeout(() => {
                  console.log("⚠️ Max duration reached (7s), forcing send...");
                  stopRecordingAndSend();
              }, 7000);
          }
          // Сбрасываем таймер тишины, пока говорим
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
      } else {
          // Если мы говорили, а теперь тишина
          if (isSpeakingRef.current && !silenceTimerRef.current) {
              // Ждем 800мс тишины
              silenceTimerRef.current = setTimeout(() => {
                  console.log("🤫 Silence detected, sending...");
                  stopRecordingAndSend();
              }, 800); 
          }
      }

      requestAnimationFrame(detectVoiceActivity);
  };

  const stopRecordingAndSend = async () => {
      // Очистка таймеров
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (maxDurationTimerRef.current) { clearTimeout(maxDurationTimerRef.current); maxDurationTimerRef.current = null; }
      
      isSpeakingRef.current = false;
      setIsRecording(false);
      processorRef.current?.port.postMessage({ type: 'stopRecording' });

      if (audioChunksRef.current.length === 0) return;

      const flat = new Float32Array(audioChunksRef.current.reduce((acc, val) => acc + val.length, 0));
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
          flat.set(chunk, offset);
          offset += chunk.length;
      }
      
      // Игнорируем очень короткие "всплески" (меньше 0.3 сек)
      if (flat.length < 16000 * 0.3) {
          console.log("Ignored short noise (<0.3s)");
          audioChunksRef.current = [];
          return;
      }

      const buffer = flat.buffer.slice(flat.byteOffset, flat.byteOffset + flat.byteLength);
      const base64 = arrayBufferToBase64(buffer);

      if (sessionIdRef.current && socketRef.current) {
        console.log(`Sending audio chunk (${base64.length} bytes)...`);
        socketRef.current.emit("audio-chunk", {
            sessionId: sessionIdRef.current, 
            audioData: base64,
            sampleRate: 16000,
            channels: 1,
            isFinal: true
        });
        setStatus("⏳ Обработка...");
      }
      
      audioChunksRef.current = [];
  };

  const stopAudio = () => {
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsCalling(false);
      isSpeakingRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
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
        <Typography variant="h6" sx={{ mb: 2, color: calibrating ? '#ff9800' : 'inherit' }}>
          {status}
        </Typography>
        
        {/* Индикатор громкости */}
        <Box sx={{ width: '80%', margin: '0 auto 20px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">Mic Level: {volume.toFixed(1)}</Typography>
                <Typography variant="caption" color="error">Threshold: {thresholdDisplay.toFixed(1)}</Typography>
            </Box>
            <LinearProgress 
                variant="determinate" 
                value={Math.min(volume * 2, 100)} 
                color={isRecording ? "error" : volume > thresholdDisplay ? "warning" : "primary"}
                sx={{ height: 10, borderRadius: 5 }}
            />
        </Box>

        <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
            <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: isRecording ? '#ef5350' : '#2196f3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: '0.1s',
                transform: `scale(${1 + Math.min(volume/50, 0.3)})`,
                boxShadow: `0 0 ${volume * 2}px ${isRecording ? 'red' : '#2196f333'}` 
            }}>
                {isRecording ? <RecordVoiceOver style={{ fontSize: 50, color: 'white' }} /> : <Mic style={{ fontSize: 50, color: 'white' }} />}
            </div>
        </Box>

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

      {incidentData && (
          <Card variant="outlined">
              <CardContent>
                  <Typography variant="h6">📋 Данные (Live)</Typography>
                  <Stack direction="row" spacing={1} my={1}>
                      <Chip label={incidentData.priority?.toUpperCase()} color={incidentData.priority === 'critical' ? 'error' : 'warning'} />
                      <Chip label={incidentData.category} />
                  </Stack>
                  <Typography><b>Адрес:</b> {incidentData.address}</Typography>
              </CardContent>
          </Card>
      )}

      <audio ref={aiAudioRef} style={{ display: 'none' }} />
    </Box>
  );
};

export default CallSimulator;