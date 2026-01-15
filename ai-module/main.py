from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

from services.speech_to_text import SpeechToTextService
from services.nlp_classifier import NLPClassifierService
from services.priority_detector import PriorityDetectorService
from services.openai_classifier import OpenAIClassifierService, ClassificationResult

app = FastAPI(title="AI Call Intake Module", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
speech_service = SpeechToTextService()
classifier_service = NLPClassifierService()
priority_service = PriorityDetectorService()
openai_classifier_service = OpenAIClassifierService()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)