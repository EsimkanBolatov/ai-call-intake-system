from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
import base64
import sys

# Add parent directory to path to import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

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

# Services
logger.info("Initializing services...")
speech_service = SpeechToTextService()
logger.info("Speech service initialized")
classifier_service = NLPClassifierService()
logger.info("NLP classifier initialized")
priority_service = PriorityDetectorService()
logger.info("Priority service initialized")
openai_classifier_service = OpenAIClassifierService()
logger.info("OpenAI classifier initialized")
tts_service = TTSService()
logger.info("TTS service initialized")
logger.info("All services initialized successfully")


class TranscriptionRequest(BaseModel):
    audio_url: Optional[str] = None
    language: str = "ru"


class ClassificationResponse(BaseModel):
    text: str
    language: str
    categories: list[str]
    priority: str
    confidence: float


class EnhancedClassificationResponse(BaseModel):
    text: str
    categories: list[str]
    priority: str
    service_type: str
    is_false_call: bool
    confidence: float
    extracted_info: dict
    summary: str
    recommended_action: str
    recommended_department: str


class ProcessCallRequest(BaseModel):
    sessionId: str
    audioData: str  # base64 encoded audio
    sampleRate: int = 16000
    channels: int = 1
    history: Optional[list] = None


class ProcessCallResponse(BaseModel):
    userText: str
    responseText: str
    audioBase64: Optional[str] = None
    incident: dict


class ProcessCallRequest(BaseModel):
    sessionId: str
    audioData: str  # base64 encoded audio
    sampleRate: int = 16000
    channels: int = 1
    history: list[dict] = []  # chat history


class ProcessCallResponse(BaseModel):
    userText: str
    responseText: str
    audioBase64: Optional[str] = None
    incident: dict = {}


@app.get("/health")
async def health():
    return {"status": "ok", "module": "ai"}


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = "ru"):
    """
    Transcribe audio file to text.
    """
    try:
        contents = await file.read()
        # In a real implementation, save file temporarily
        text = speech_service.transcribe(contents, language)
        return {"text": text, "language": language}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel

class ClassifyRequest(BaseModel):
    text: str
    enhanced: bool = True

@app.post("/classify")
async def classify_text(request: ClassifyRequest):
    """
    Classify text into categories and determine priority.
    If enhanced=True (default), uses OpenAI for detailed classification.
    """
    text = request.text
    enhanced = request.enhanced
    try:
        if enhanced and openai_classifier_service.client:
            result: ClassificationResult = openai_classifier_service.classify(text)
            # Map service_type to recommended_department
            dept_map = {
                "fire": "Пожарная служба",
                "emergency": "МЧС (Чрезвычайная ситуация)",
                "ambulance": "Скорая помощь",
                "police": "Полиция",
                "other": "Другое"
            }
            recommended_department = dept_map.get(result.service_type, "Другое")
            return EnhancedClassificationResponse(
                text=text,
                categories=result.categories,
                priority=result.priority,
                service_type=result.service_type,
                is_false_call=result.is_false_call,
                confidence=result.confidence,
                extracted_info=result.extracted_info,
                summary=result.summary,
                recommended_action=result.recommended_action,
                recommended_department=recommended_department
            )
        else:
            # Fallback to legacy classifier
            category = classifier_service.classify(text)  # returns string
            priority = priority_service.determine_priority(text, category)
            return ClassificationResponse(
                text=text,
                language="ru",
                categories=[category],  # wrap in list for compatibility
                priority=priority,
                confidence=0.85
            )
    except Exception as e:
        logger.error(f"Classification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-call")
async def process_call(request: ProcessCallRequest):
    """
    Process a voice call: STT -> LLM -> TTS
    """
    try:
        session_id = request.sessionId
        audio_data = request.audioData
        sample_rate = request.sampleRate
        channels = request.channels
        history = request.history

        logger.info(f"[{session_id}] Processing call with {len(audio_data)} chars audio data")

        # 1. Decode audio from base64
        import base64
        audio_bytes = base64.b64decode(audio_data)

        # 2. STT
        user_text = speech_service.transcribe(audio_bytes, "ru")
        if not user_text or len(user_text.strip()) < 2:
            return ProcessCallResponse(
                userText="",
                responseText="",
                audioBase64=None,
                incident={}
            )

        logger.info(f"[{session_id}] STT: {user_text}")

        # 3. LLM Classification
        if openai_classifier_service.client:
            classification = openai_classifier_service.classify(user_text)
            incident_data = {
                "categories": classification.categories,
                "priority": classification.priority,
                "service_type": classification.service_type,
                "is_false_call": classification.is_false_call,
                "confidence": classification.confidence,
                "extracted_info": classification.extracted_info,
                "summary": classification.summary,
                "recommended_action": classification.recommended_action,
                "recommended_department": classification.recommended_department
            }
        else:
            # Fallback
            category = classifier_service.classify(user_text)
            priority = priority_service.determine_priority(user_text, category)
            incident_data = {
                "categories": [category],
                "priority": priority,
                "service_type": "other",
                "is_false_call": False,
                "confidence": 0.85,
                "extracted_info": {},
                "summary": user_text,
                "recommended_action": "Обработать звонок",
                "recommended_department": "Другое"
            }

        # 4. Generate dispatcher response
        # For now, use a simple template. In production, use LLM for response generation
        response_text = f"Ваше сообщение принято. Категория: {incident_data['categories'][0]}. Приоритет: {incident_data['priority']}."

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
        logger.error(f"Process call error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-call", response_model=ProcessCallResponse)
async def process_call(request: ProcessCallRequest):
    """
    Process a voice call: STT -> Classification -> LLM Response -> TTS
    """
    try:
        session_id = request.sessionId
        logger.info(f"Processing call for session {session_id}")

        # 1. Decode audio from base64
        audio_data = base64.b64decode(request.audioData)

        # 2. Speech to Text
        user_text = speech_service.transcribe(audio_data, "ru")
        if not user_text or len(user_text.strip()) < 2:
            return ProcessCallResponse(
                userText="",
                responseText="",
                audioBase64=None,
                incident={}
            )

        logger.info(f"[{session_id}] STT: {user_text}")

        # 3. Classify and analyze
        classification = openai_classifier_service.classify(user_text)

        # 4. Generate dispatcher response using LLM
        # For now, use a simple response based on classification
        if classification.priority == "critical":
            response_text = f"Критическая ситуация! {classification.recommended_action} Где вы находитесь?"
        elif classification.priority == "high":
            response_text = f"Ситуация срочная. {classification.recommended_action} Подробности?"
        else:
            response_text = f"Понял. {classification.recommended_action} Что еще можете рассказать?"

        # 5. Text to Speech
        audio_response = None
        try:
            audio_response = tts_service.generate_speech(response_text, "ru")
            if audio_response:
                audio_base64 = base64.b64encode(audio_response).decode('utf-8')
            else:
                audio_base64 = None
        except Exception as e:
            logger.error(f"TTS error: {e}")
            audio_base64 = None

        # 6. Prepare incident data
        incident = {
            "priority": classification.priority,
            "category": classification.categories[0] if classification.categories else "Не определено",
            "service_type": classification.service_type,
            "address": classification.extracted_info.get("address", "Не указан"),
            "summary": classification.summary,
            "recommended_department": classification.recommended_department
        }

        return ProcessCallResponse(
            userText=user_text,
            responseText=response_text,
            audioBase64=audio_base64,
            incident=incident
        )

    except Exception as e:
        logger.error(f"Process call error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Don't run server here, use uvicorn command instead
    pass