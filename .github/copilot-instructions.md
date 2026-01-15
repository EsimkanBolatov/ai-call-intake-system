# AI Call Intake System - Copilot Instructions

## Architecture Overview
This is a multilingual (Russian/Kazakh) AI-powered emergency call intake system for government services. Core flow: Incoming calls via Asterisk PBX → Python AGI script → AI processing (STT/LLM/TTS) → Database logging → Optional routing to departments.

**Key Components:**
- **Asterisk** (`asterisk/`): Telephony server handling SIP calls and audio recording
- **AGI Handler** (`agi/call_handler.py`): Python script interfacing Asterisk with AI services
- **AI Services** (`services/`): STT (Whisper), LLM (OpenAI/DeepSeek), TTS (Coqui/OpenAI), classification
- **AI Module** (`ai-module/`): FastAPI wrapper for AI endpoints
- **Backend** (`backend/`): NestJS REST API with TypeORM, JWT auth, user/case management
- **Frontend** (`frontend/`): React SPA with Material-UI, charts, call simulator
- **Dashboard** (`dashboard/`): Flask monitoring interface

**Data Flow:** Call → Asterisk dialplan → AGI → STT transcription → LLM classification → TTS response → PostgreSQL logging

## Critical Workflows

### Full System Launch
```bash
cd deployment
docker-compose up -d
```
Services: Frontend:5173, Backend:3000, AI:8001, MinIO:9001, Postgres:5432

### Local Development
- **Backend:** `cd backend && npm run start:dev`
- **Frontend:** `cd frontend && npm run dev`
- **AI Module:** `cd ai-module && uvicorn main:app --reload --port 8001`
- **Asterisk:** Copy configs to `/etc/asterisk/`, restart service

### Testing Calls
Use `test_call_emulation.py` to simulate calls without telephony hardware.

## Project-Specific Patterns

### AI Output Format
All LLM responses must be strict JSON matching `docs/JSON_FORMAT.md`:
```json
{
  "urgency": "critical|high|medium|low",
  "category": "theft|assault|domestic|...",
  "address": "extracted address or 'не указан'",
  "current_danger": true/false,
  "people_involved": number,
  "weapons": true/false,
  "recommended_department": "Полиция|Скорая|МЧС|Акимат",
  "summary": "brief Russian description",
  "needs_clarification": true/false,
  "clarification_questions": ["question1", "question2"]
}
```
Example: See `services/llm_service.py` for prompt engineering and validation.

### Service Architecture
- Python services in `services/` follow class-based pattern with async methods
- AGI script imports services directly: `from services.stt_service import STTService`
- AI module exposes REST endpoints wrapping these services

### Multilingual Support
- Default language: Kazakh (`kk`) for TTS/STT
- Prompts and responses in Russian/Kazakh
- Audio processing supports both languages via Whisper

### Database Schema
- Calls table: `timestamp, caller_id, audio_path, transcript, ai_json, status`
- Use PostgreSQL in production, SQLite for dev/testing
- Migrations via Alembic for Python services

### Error Handling
- AGI scripts must never crash calls - use try/except with logging
- AI services return fallback responses on failure
- Backend validates AI JSON before processing

## Key Files to Reference
- `docs/ARCHITECTURE_ASCII.md`: System flow diagram
- `agi/call_handler.py`: Main call processing logic
- `services/llm_service.py`: AI integration patterns
- `backend/src/modules/cases/`: Case management entities
- `frontend/src/pages/CallSimulator/`: UI for testing

## Development Notes
- Use Docker for consistent environments
- Test AI components with sample audio files in `test_call_emulation.py`
- Monitor logs in `/var/log/ai-call-intake/` for debugging
- API docs at backend:3000/api/docs when running