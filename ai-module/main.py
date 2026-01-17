from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
import base64
import sys
from openai import OpenAI

# Настройка путей и сервисов
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from services.speech_to_text import SpeechToTextService
from services.openai_classifier import OpenAIClassifierService
from services.tts_service import TTSService

app = FastAPI(title="AI Call Intake Module")

# CORS и Логи
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Инициализация (ленивая - при первом запросе)
speech_service = None
openai_classifier_service = None
tts_service = None
client = None

def initialize_services():
    """Инициализация сервисов при первом запросе (ленивая загрузка)"""
    global speech_service, openai_classifier_service, tts_service, client
    
    if speech_service is not None:
        return  # Уже инициализировано
    
    try:
        # Используем mock для STT и TTS при старте
        os.environ['STT_ENGINE'] = 'mock'  # Принудительно mock
        os.environ['TTS_ENGINE'] = 'mock'  # Принудительно mock
        
        speech_service = SpeechToTextService()
        openai_classifier_service = OpenAIClassifierService()
        tts_service = TTSService()
        
        # OpenAI client может отсутствовать без API key
        api_key = os.getenv("OPENAI_API_KEY", "sk-test-key")
        client = OpenAI(api_key=api_key)
        logger.info("✅ Services Initialized Successfully (mock engines, lazy loading)")
    except Exception as e:
        logger.error(f"❌ Error initializing services: {e}", exc_info=True)
        client = None

# --- Модели данных ---
class ProcessCallRequest(BaseModel):
    sessionId: str
    audioData: str 
    history: List[Dict[str, str]] = [] 

class ProcessCallResponse(BaseModel):
    userText: str
    responseText: str
    audioBase64: Optional[str] = None
    incident: Dict[str, Any] = {}

# --- Промпт Диспетчера ---
SYSTEM_PROMPT = """Ты — опытный оператор службы 112 (Казахстан). 
Твоя цель: успокоить, узнать СУТЬ происшествия и АДРЕС.
Отвечай кратко (1-2 предложения). Не трать время на вежливость, если ситуация критическая.
Если пользователь молчит или говорит невнятно, переспроси.
"""

# --- Эндпоинты ---

@app.get("/health")
def health():
    return {"status": "ok", "version": "updated_v2"}

@app.post("/process-call", response_model=ProcessCallResponse)
async def process_call(request: ProcessCallRequest):
    try:
        # Инициализация сервисов при первом запросе
        initialize_services()
        
        session_id = request.sessionId
        logger.info(f"[{session_id}] 📨 Processing audio chunk...")

        # 1. Audio -> Text
        user_text = ""
        try:
            if not request.audioData or len(request.audioData) < 10:
                logger.warning(f"[{session_id}] Audio data too short")
                return ProcessCallResponse(userText="", responseText="")
                
            audio_bytes = base64.b64decode(request.audioData)
            logger.info(f"[{session_id}] Decoded audio: {len(audio_bytes)} bytes")
            
            # Transcribe
            user_text = speech_service.transcribe(audio_bytes, "ru")
            logger.info(f"[{session_id}] STT result: {user_text}")
        except Exception as e:
            logger.error(f"[{session_id}] STT Error: {str(e)}", exc_info=True)
            return ProcessCallResponse(userText="", responseText="Error in STT")

        # Фильтр тишины
        if not user_text or len(user_text.strip()) < 2:
            logger.info(f"[{session_id}] Silent or too short")
            return ProcessCallResponse(userText="", responseText="")

        logger.info(f"[{session_id}] 🗣️ User: {user_text}")

        # 2. Text -> AI Response
        ai_text = "Понял. Что еще можете рассказать?"
        try:
            if not client:
                logger.warning(f"[{session_id}] OpenAI client not initialized")
                ai_text = "Система готова. Расскажите подробнее."
            else:
                messages = [{"role": "system", "content": SYSTEM_PROMPT}]
                # Добавляем историю (последние 4 сообщения для контекста)
                messages.extend(request.history[-4:]) 
                messages.append({"role": "user", "content": user_text})

                completion = client.chat.completions.create(
                    model="gpt-4o-mini", messages=messages, max_tokens=100, timeout=5
                )
                ai_text = completion.choices[0].message.content
                logger.info(f"[{session_id}] 🤖 AI: {ai_text}")
        except Exception as e:
            logger.error(f"[{session_id}] LLM Error: {str(e)}")
            ai_text = "Извините, ошибка обработки."

        # 3. AI -> Incident Data (для ЕРДР)
        incident_data = {"type": "Unknown", "address": "", "priority": "low", "description": user_text}
        try:
            classification = openai_classifier_service.classify(user_text)
            incident_data = {
                "type": classification.categories[0] if classification.categories else "Unknown",
                "address": classification.extracted_info.get("address", ""),
                "priority": classification.priority,
                "description": user_text
            }
            logger.info(f"[{session_id}] Classification: {incident_data['type']}")
        except Exception as e:
            logger.error(f"[{session_id}] Classification Error: {str(e)}")

        # 4. Text -> Audio
        audio_b64 = None
        try:
            audio_response = tts_service.generate_speech(ai_text, "ru")
            audio_b64 = base64.b64encode(audio_response).decode('utf-8') if audio_response else None
            logger.info(f"[{session_id}] TTS: Generated {len(audio_b64) if audio_b64 else 0} bytes")
        except Exception as e:
            logger.error(f"[{session_id}] TTS Error: {str(e)}")

        return ProcessCallResponse(
            userText=user_text,
            responseText=ai_text,
            audioBase64=audio_b64,
            incident=incident_data
        )

    except Exception as e:
        logger.error(f"❌ Error in process-call: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        access_log=True,
        log_level="info"
    )