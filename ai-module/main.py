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

# Инициализация (с проверкой)
try:
    speech_service = SpeechToTextService()
    openai_classifier_service = OpenAIClassifierService()
    tts_service = TTSService()
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    logger.info("✅ Services Initialized Successfully")
except Exception as e:
    logger.error(f"❌ Error initializing services: {e}")

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
        session_id = request.sessionId
        logger.info(f"[{session_id}] 📨 Processing audio chunk...")

        # 1. Audio -> Text
        try:
            audio_bytes = base64.b64decode(request.audioData)
            user_text = speech_service.transcribe(audio_bytes, "ru")
        except Exception as e:
            logger.warning(f"Decoding failed: {e}")
            return ProcessCallResponse(userText="", responseText="")

        # Фильтр тишины
        if not user_text or len(user_text.strip()) < 2:
            return ProcessCallResponse(userText="", responseText="")

        logger.info(f"[{session_id}] 🗣️ User: {user_text}")

        # 2. Text -> AI Response
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        # Добавляем историю (последние 4 сообщения для контекста)
        messages.extend(request.history[-4:]) 
        messages.append({"role": "user", "content": user_text})

        completion = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, max_tokens=100
        )
        ai_text = completion.choices[0].message.content
        logger.info(f"[{session_id}] 🤖 AI: {ai_text}")

        # 3. AI -> Incident Data (для ЕРДР)
        # Классифицируем каждый ответ, чтобы обновлять карточку в реальном времени
        classification = openai_classifier_service.classify(user_text)
        incident_data = {
            "type": classification.categories[0] if classification.categories else "Unknown",
            "address": classification.extracted_info.get("address", ""),
            "priority": classification.priority,
            "description": user_text
        }

        # 4. Text -> Audio
        audio_response = tts_service.generate_speech(ai_text, "ru")
        audio_b64 = base64.b64encode(audio_response).decode('utf-8') if audio_response else None

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
    # ВАЖНО: reload=True
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)