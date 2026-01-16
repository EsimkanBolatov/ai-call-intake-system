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

# Add parent directory to path to import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

# Импорт сервисов
from services.speech_to_text import SpeechToTextService
from services.nlp_classifier import NLPClassifierService
from services.priority_detector import PriorityDetectorService
from services.openai_classifier import OpenAIClassifierService, ClassificationResult
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
logger.info("Initializing services...")
speech_service = SpeechToTextService()
openai_classifier_service = OpenAIClassifierService()
tts_service = TTSService()

# Клиент OpenAI для генерации ответов (Chat)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

logger.info("All services initialized successfully")

# --- Models ---

class ProcessCallRequest(BaseModel):
    sessionId: str
    audioData: str  # base64 encoded audio
    sampleRate: int = 16000
    channels: int = 1
    history: List[Dict[str, str]] = []  # Chat history from NestJS

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
    return {"status": "ok", "module": "ai"}

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = "ru"):
    try:
        contents = await file.read()
        text = speech_service.transcribe(contents, language)
        return {"text": text, "language": language}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/classify")
async def classify_text(text: str):
    # Упрощенный эндпоинт для совместимости
    result = openai_classifier_service.classify(text)
    return result

@app.post("/process-call", response_model=ProcessCallResponse)
async def process_call(request: ProcessCallRequest):
    """
    Полный цикл обработки звонка:
    1. Декодирование аудио
    2. STT (Whisper)
    3. LLM (Генерация ответа диспетчера с учетом истории)
    4. TTS (Озвучка ответа)
    5. Классификация (параллельно для ЕРДР)
    """
    try:
        session_id = request.sessionId
        logger.info(f"[{session_id}] Processing audio chunk...")

        # 1. Decode Audio
        try:
            audio_bytes = base64.b64decode(request.audioData)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 audio data")

        # 2. STT (Speech to Text)
        user_text = speech_service.transcribe(audio_bytes, "ru")
        
        # Если тишина или мусор — возвращаем пустой ответ, чтобы не триггерить AI зря
        if not user_text or len(user_text.strip()) < 2:
            logger.info(f"[{session_id}] Ignored empty/short speech")
            return ProcessCallResponse(
                userText="",
                responseText="",
                audioBase64=None,
                incident={}
            )

        logger.info(f"[{session_id}] User said: {user_text}")

        # 3. LLM Response Generation (Persona 102)
        # Формируем сообщения: System + History + New User Message
        messages = [{"role": "system", "content": DISPATCHER_SYSTEM_PROMPT}]
        
        # Добавляем историю (очищаем от лишних полей, если есть)
        for msg in request.history:
            if msg.get("role") and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})
        
        messages.append({"role": "user", "content": user_text})

        # Запрос к ChatGPT для ответа
        chat_completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=150,
            temperature=0.5
        )
        response_text = chat_completion.choices[0].message.content
        logger.info(f"[{session_id}] AI Answer: {response_text}")

        # 4. Classification & Extraction (для карточки ЕРДР)
        # Делаем это отдельным вызовом, чтобы ответ диспетчера был естественным, а JSON полным
        classification = openai_classifier_service.classify(user_text) # Или можно классифицировать всю историю
        
        incident_data = {
            "category": classification.categories[0] if classification.categories else "Не определено",
            "priority": classification.priority,
            "address": classification.extracted_info.get("address"),
            "service_type": classification.service_type,
            "recommended_action": classification.recommended_action
        }

        # 5. TTS (Text to Speech)
        audio_response = tts_service.generate_speech(response_text, "ru")
        audio_base64 = base64.b64encode(audio_response).decode('utf-8') if audio_response else None

        return ProcessCallResponse(
            userText=user_text,
            responseText=response_text,
            audioBase64=audio_base64,
            incident=incident_data
        )

    except Exception as e:
        logger.error(f"Process call error: {e}")
        # Возвращаем ошибку клиенту или заглушку
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)