from fastapi import FastAPI, UploadFile, File, HTTPException
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

# Добавляем путь к родительской директории для импорта сервисов
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

# Импорт сервисов (убедитесь, что эти файлы существуют в папке services)
from services.speech_to_text import SpeechToTextService
from services.openai_classifier import OpenAIClassifierService
from services.tts_service import TTSService

app = FastAPI(title="AI Call Intake Module", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Инициализация сервисов
logger.info("Initializing services (New Version)...") # <--- ЭТА СТРОКА ДОКАЖЕТ, ЧТО КОД ОБНОВИЛСЯ
try:
    speech_service = SpeechToTextService()
    openai_classifier_service = OpenAIClassifierService()
    tts_service = TTSService()
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    logger.info("All services initialized successfully")
except Exception as e:
    logger.error(f"Error initializing services: {e}")

# --- Models ---

class ProcessCallRequest(BaseModel):
    sessionId: str
    audioData: str 
    sampleRate: int = 16000
    channels: int = 1
    history: List[Dict[str, str]] = [] 

class ProcessCallResponse(BaseModel):
    userText: str
    responseText: str
    audioBase64: Optional[str] = None
    incident: Dict[str, Any] = {}

# --- System Prompt ---
DISPATCHER_SYSTEM_PROMPT = """Ты — диспетчер экстренных служб 102 (полиция Казахстана).
Твоя задача — профессионально общаться с заявителем.

ПРИНЦИПЫ:
1. ПРИОРИТЕТ ЖИЗНИ: Если угроза жизни, оружие или насилие — СРАЗУ говори, что наряд выехал.
2. СТИЛЬ: Говори КРАТКО (макс. 1-2 предложения). Четкие команды.
3. СБОР ДАННЫХ: Узнай ЧТО случилось, ГДЕ (адрес) и КТО звонит (ФИО).
4. УСПОКОЕНИЕ: Если паника — успокой ("Я с вами, помощь едет").

Если информации достаточно (есть адрес и суть), завершай диалог фразой "Наряд выехал".
"""

# --- Endpoints ---

@app.get("/health")
async def health():
    return {"status": "ok", "module": "ai_new_version"}

@app.post("/process-call", response_model=ProcessCallResponse)
async def process_call(request: ProcessCallRequest):
    try:
        session_id = request.sessionId
        logger.info(f"[{session_id}] Processing request...")

        # 1. Decode Audio
        audio_bytes = base64.b64decode(request.audioData)

        # 2. STT
        user_text = speech_service.transcribe(audio_bytes, "ru")
        if not user_text or len(user_text.strip()) < 2:
            return ProcessCallResponse(userText="", responseText="", incident={})

        logger.info(f"[{session_id}] User: {user_text}")

        # 3. LLM
        messages = [{"role": "system", "content": DISPATCHER_SYSTEM_PROMPT}]
        for msg in request.history:
            if msg.get("role") and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_text})

        chat_completion = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, max_tokens=150
        )
        response_text = chat_completion.choices[0].message.content
        logger.info(f"[{session_id}] AI: {response_text}")

        # 4. Incident Extraction
        classification = openai_classifier_service.classify(user_text)
        incident_data = {
            "category": classification.categories[0] if classification.categories else "Unknown",
            "address": classification.extracted_info.get("address"),
            "priority": classification.priority
        }

        # 5. TTS
        audio_response = tts_service.generate_speech(response_text, "ru")
        audio_base64 = base64.b64encode(audio_response).decode('utf-8') if audio_response else None

        return ProcessCallResponse(
            userText=user_text,
            responseText=response_text,
            audioBase64=audio_base64,
            incident=incident_data
        )

    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Включаем reload=True для автоматического обновления
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)