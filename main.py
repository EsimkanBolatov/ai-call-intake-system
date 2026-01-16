"""
AI Call Intake System - Основное приложение
FastAPI приложение для обработки звонков через AGI
"""

import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from services.stt_service import STTService
from services.llm_service import LLMService
from services.tts_service import TTSService
from services.classifier import IncidentClassifier
from services.logger import CallLogger

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/ai-call.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Глобальные переменные для сервисов
stt_service = None
llm_service = None
tts_service = None
classifier = None
call_logger = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan менеджер для инициализации и очистки ресурсов
    """
    # Инициализация при запуске
    logger.info("Инициализация AI Call Intake System...")
    
    global stt_service, llm_service, tts_service, classifier, call_logger
    
    try:
        # Инициализация сервисов
        stt_service = STTService(
            engine=os.getenv("STT_ENGINE", "whisper"),
            language=os.getenv("DEFAULT_LANGUAGE", "kk")
        )
        
        llm_service = LLMService(
            engine=os.getenv("LLM_ENGINE", "openai"),
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        tts_service = TTSService(
            engine=os.getenv("TTS_ENGINE", "coqui"),
            language=os.getenv("DEFAULT_LANGUAGE", "kk")
        )
        
        classifier = IncidentClassifier()
        
        call_logger = CallLogger(
            db_path=os.getenv("DATABASE_URL", "calls.db")
        )
        
        logger.info("Сервисы успешно инициализированы")
        
    except Exception as e:
        logger.error(f"Ошибка инициализации сервисов: {e}")
        raise
    
    yield
    
    # Очистка при завершении
    logger.info("Очистка ресурсов AI Call Intake System...")
    # Здесь можно добавить очистку ресурсов

# Создание FastAPI приложения
app = FastAPI(
    title="AI Call Intake System",
    description="Система автоматического приема и обработки звонков для службы 102",
    version="1.0.0",
    lifespan=lifespan
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В production заменить на конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Маршруты API
@app.get("/")
async def root():
    """Корневой маршрут"""
    return {
        "service": "AI Call Intake System",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "process_call": "/api/calls/process",
            "get_calls": "/api/calls",
            "dashboard": "/dashboard"
        }
    }

@app.get("/health")
async def health_check():
    """Проверка здоровья системы"""
    services_status = {
        "stt_service": stt_service is not None,
        "llm_service": llm_service is not None,
        "tts_service": tts_service is not None,
        "classifier": classifier is not None,
        "call_logger": call_logger is not None
    }
    
    all_healthy = all(services_status.values())
    
    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services_status,
        "timestamp": "2025-12-30T10:00:00Z"  # В production использовать datetime.now()
    }

@app.post("/api/calls/process")
async def process_call(call_data: dict):
    """
    Обработка входящего звонка
    
    Параметры:
    - caller_number: номер звонящего
    - language: язык (kk/ru)
    - audio_data: аудио данные в base64 (опционально)
    - transcript: текстовый транскрипт (опционально)
    """
    try:
        caller_number = call_data.get("caller_number")
        language = call_data.get("language", "kk")
        
        logger.info(f"Обработка звонка от {caller_number} на языке {language}")
        
        # Если есть аудио данные, преобразуем в текст
        audio_data = call_data.get("audio_data")
        if audio_data and stt_service:
            transcript_result = stt_service.transcribe(audio_data, language)
            transcript = transcript_result.get("text", "")
            confidence = transcript_result.get("confidence", 0.0)
        else:
            transcript = call_data.get("transcript", "")
            confidence = 1.0
        
        # Анализ транскрипта с помощью LLM
        if llm_service and transcript:
            analysis = llm_service.analyze_incident(transcript, language)
        else:
            # Fallback анализ
            analysis = classifier.classify(transcript) if classifier else {
                "urgency": "medium",
                "category": "other",
                "summary": transcript[:100] if transcript else "Нет транскрипта"
            }
        
        # Генерация ответа TTS
        if tts_service:
            response_text = generate_response(analysis, language)
            tts_audio = tts_service.synthesize(response_text, language)
        else:
            response_text = "Деректеріңізді қабылдадық. Көмек жолдалады."
            tts_audio = None
        
        # Логирование звонка
        if call_logger:
            call_id = call_logger.log_call(
                caller_number=caller_number,
                language=language,
                transcript=transcript,
                ai_analysis=analysis,
                duration=0,  # В реальной системе рассчитывается
                status="processed"
            )
        else:
            call_id = "no_logger"
        
        return {
            "call_id": call_id,
            "transcript": transcript,
            "confidence": confidence,
            "analysis": analysis,
            "response_text": response_text,
            "tts_audio": tts_audio if tts_audio else None,
            "status": "processed"
        }
        
    except Exception as e:
        logger.error(f"Ошибка обработки звонка: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calls")
async def get_calls(limit: int = 10, offset: int = 0):
    """Получение списка звонков"""
    try:
        if call_logger:
            calls = call_logger.get_recent_calls(limit=limit, offset=offset)
            total = call_logger.get_total_calls()
        else:
            calls = []
            total = 0
        
        return {
            "calls": calls,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Ошибка получения списка звонков: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calls/{call_id}")
async def get_call_details(call_id: str):
    """Получение деталей конкретного звонка"""
    try:
        if call_logger:
            call_details = call_logger.get_call_details(call_id)
            if not call_details:
                raise HTTPException(status_code=404, detail="Звонок не найден")
            return call_details
        else:
            raise HTTPException(status_code=503, detail="Сервис логирования недоступен")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения деталей звонка: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def generate_response(analysis: dict, language: str) -> str:
    """Генерация текстового ответа на основе анализа"""
    
    urgency_map = {
        "critical": "өте жедел",
        "high": "жедел",
        "medium": "орташа",
        "low": "төмен"
    }
    
    urgency_text = urgency_map.get(analysis.get("urgency", "medium"), "орташа")
    
    if language == "kk":
        return f"Түсінікті. Сіздің шағымдарыңызды {urgency_text} деңгейде қабылдадық. Көмек жолдалады."
    else:
        return f"Понятно. Ваше обращение принято с уровнем срочности {urgency_text}. Помощь направляется."

# AGI совместимый endpoint
@app.post("/agi/process")
async def agi_process(agi_data: dict):
    """
    Endpoint для AGI скрипта Asterisk
    
    Формат данных совместим с call_handler.py
    """
    try:
        # Преобразование AGI формата в внутренний формат
        call_data = {
            "caller_number": agi_data.get("callerid"),
            "language": agi_data.get("language", "kk"),
            "channel": agi_data.get("channel"),
            "uniqueid": agi_data.get("uniqueid")
        }
        
        # Обработка звонка
        result = await process_call(call_data)
        
        # Форматирование ответа для AGI
        agi_response = {
            "status": "success",
            "response": result.get("response_text", ""),
            "tts_file": result.get("tts_audio"),
            "analysis": result.get("analysis")
        }
        
        return agi_response
        
    except Exception as e:
        logger.error(f"Ошибка AGI обработки: {e}")
        return {
            "status": "error",
            "error": str(e),
            "response": "Кешіріңіз, жүйеде қате орын алды."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )