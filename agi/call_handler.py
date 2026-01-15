#!/usr/bin/env python3
"""
AI Call Intake System - Asterisk AGI Script
Handles incoming calls, processes speech with AI, and provides responses.
"""

import sys
import os
import logging
import json
import tempfile
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# AGI library for Asterisk interaction
try:
    import asterisk.agi
    AGI_AVAILABLE = True
except ImportError:
    # Fallback for testing without Asterisk
    AGI_AVAILABLE = False
    print("WARNING: asterisk.agi not available, running in test mode")

from services.stt_service import STTService
from services.llm_service import LLMService
from services.tts_service import TTSService
from services.classifier import IncidentClassifier
from services.logger import CallLogger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/ai-call-intake/agi.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class CallHandler:
    """Main call handling class."""
    
    def __init__(self, agi=None):
        """
        Initialize call handler.
        
        Args:
            agi: Asterisk AGI instance or None for testing
        """
        self.agi = agi
        self.caller_id = None
        self.language = 'ru'  # default language
        self.call_start_time = datetime.now()
        self.call_data = {
            'caller_id': None,
            'language': None,
            'transcript': None,
            'ai_response': None,
            'classification': None,
            'recording_path': None,
            'duration': None,
            'status': 'initiated'
        }
        
        # Initialize services
        logger.info("Initializing AI services...")
        self.stt_service = STTService()
        self.llm_service = LLMService()
        self.tts_service = TTSService()
        self.classifier = IncidentClassifier()
        self.logger_service = CallLogger()
        
        # Greeting messages
        self.greetings = {
            'ru': "102 қызметінің автоматты көмекшісісіз. Қысқаша не болғанын айтыңыз.",
            'kk': "102 қызметінің автоматты көмекшісісіз. Қысқаша не болғанын айтыңыз.",
            'en': "This is the automated assistant of 102 service. Please briefly describe what happened."
        }
        
        # Follow-up questions (max 3)
        self.follow_up_questions = {
            'ru': [
                "Не болды?",
                "Қай жерде?",
                "Қазір қауіп бар ма?",
                "Қанша адам?",
                "Қару бар ма?"
            ],
            'kk': [
                "Не болды?",
                "Қай жерде?",
                "Қазір қауіп бар ма?",
                "Қанша адам?",
                "Қару бар ма?"
            ],
            'en': [
                "What happened?",
                "Where?",
                "Is there danger now?",
                "How many people?",
                "Are there weapons?"
            ]
        }
        
        logger.info("CallHandler initialized")

    def set_caller_info(self, caller_id, language='ru'):
        """Set caller information."""
        self.caller_id = caller_id
        self.language = language if language in ['ru', 'kk', 'en'] else 'ru'
        self.call_data['caller_id'] = caller_id
        self.call_data['language'] = self.language
        logger.info(f"Call from {caller_id}, language: {self.language}")

    def play_greeting(self):
        """Play greeting message to caller."""
        greeting = self.greetings[self.language]
        logger.info(f"Playing greeting: {greeting}")
        
        if self.agi:
            # Generate TTS and play
            audio_path = self.tts_service.text_to_speech(greeting, self.language)
            if audio_path and os.path.exists(audio_path):
                self.agi.stream_file(audio_path.replace('.wav', ''))  # Asterisk expects no extension
            else:
                # Fallback to pre-recorded or synthesized voice
                self.agi.stream_file('custom/ai_greeting')
        else:
            print(f"[TTS] {greeting}")
        
        self.call_data['greeting_played'] = True

    def record_response(self, duration=10, silence_threshold=2):
        """
        Record caller's response.
        
        Args:
            duration: Maximum recording duration in seconds
            silence_threshold: Silence detection threshold in seconds
            
        Returns:
            Path to recorded audio file or None
        """
        logger.info(f"Recording response for {duration} seconds...")
        
        if self.agi:
            # Create temporary file for recording
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                recording_path = tmp.name
            
            # Asterisk recording command
            # Note: Actual implementation depends on Asterisk version and configuration
            self.agi.record_file(recording_path, 'wav', duration, silence_threshold)
            
            # Wait for recording to complete
            self.agi.wait_for_digit(1000)
            
            if os.path.exists(recording_path) and os.path.getsize(recording_path) > 0:
                logger.info(f"Recording saved: {recording_path}")
                self.call_data['recording_path'] = recording_path
                return recording_path
            else:
                logger.warning("Recording failed or empty")
                return None
        else:
            # Test mode - simulate recording
            print("[TEST] Recording simulation...")
            test_audio = "test_audio.wav"
            self.call_data['recording_path'] = test_audio
            return test_audio

    def transcribe_audio(self, audio_path):
        """
        Transcribe audio to text using STT service.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Transcribed text or None
        """
        if not audio_path or not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return None
        
        logger.info(f"Transcribing audio: {audio_path}")
        
        try:
            with open(audio_path, 'rb') as f:
                audio_data = f.read()
            
            transcript = self.stt_service.transcribe(audio_data, self.language)
            logger.info(f"Transcription: {transcript}")
            
            self.call_data['transcript'] = transcript
            return transcript
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return None

    def analyze_with_ai(self, transcript, max_questions=3):
        """
        Analyze transcript with LLM and conduct follow-up dialog.
        
        Args:
            transcript: Initial caller transcript
            max_questions: Maximum number of follow-up questions
            
        Returns:
            Dictionary with classification results
        """
        logger.info(f"Analyzing transcript with AI...")
        
        # Initial analysis
        initial_result = self.llm_service.analyze_incident(transcript, self.language)
        
        # If more information is needed, ask follow-up questions
        questions_asked = 0
        all_responses = [transcript]
        
        while questions_asked < max_questions and initial_result.get('needs_clarification', False):
            # Get next question
            question_idx = questions_asked % len(self.follow_up_questions[self.language])
            question = self.follow_up_questions[self.language][question_idx]
            
            # Ask question
            logger.info(f"Asking follow-up: {question}")
            self._play_text(question)
            
            # Record response
            response_audio = self.record_response(duration=8)
            if response_audio:
                response_text = self.transcribe_audio(response_audio)
                if response_text:
                    all_responses.append(response_text)
                    
                    # Update analysis with new information
                    combined_text = " ".join(all_responses)
                    initial_result = self.llm_service.analyze_incident(combined_text, self.language)
            
            questions_asked += 1
        
        # Final classification
        final_result = self.classifier.classify(initial_result)
        
        # Ensure JSON format compliance
        compliant_result = self._ensure_json_compliance(final_result)
        
        logger.info(f"AI analysis complete: {json.dumps(compliant_result, indent=2, ensure_ascii=False)}")
        self.call_data['ai_response'] = compliant_result
        self.call_data['classification'] = compliant_result.get('category', 'unknown')
        
        return compliant_result

    def _play_text(self, text):
        """Convert text to speech and play."""
        if self.agi:
            audio_path = self.tts_service.text_to_speech(text, self.language)
            if audio_path and os.path.exists(audio_path):
                self.agi.stream_file(audio_path.replace('.wav', ''))
        else:
            print(f"[TTS] {text}")

    def _ensure_json_compliance(self, result):
        """Ensure result matches required JSON format."""
        required_format = {
            "urgency": "",
            "category": "",
            "address": "",
            "current_danger": False,
            "people_involved": 0,
            "weapons": False,
            "recommended_department": "",
            "summary": ""
        }
        
        # Merge with defaults
        compliant = required_format.copy()
        compliant.update(result)
        
        # Validate and fix types
        compliant['urgency'] = str(compliant.get('urgency', '')).lower()
        if compliant['urgency'] not in ['critical', 'high', 'medium', 'low']:
            compliant['urgency'] = 'medium'
        
        compliant['current_danger'] = bool(compliant.get('current_danger', False))
        compliant['people_involved'] = int(compliant.get('people_involved', 0))
        compliant['weapons'] = bool(compliant.get('weapons', False))
        
        return compliant

    def generate_response(self, analysis_result):
        """
        Generate appropriate response based on analysis.
        
        Args:
            analysis_result: AI analysis dictionary
            
        Returns:
            Response text
        """
        urgency = analysis_result.get('urgency', 'medium')
        category = analysis_result.get('category', 'unknown')
        
        responses = {
            'ru': {
                'critical': "Сіздің шағымдарыңыз қабылданды. Жедел көмек жолға қойылды. Қауіпті жағдайда полицияға тікелей хабарласыңыз.",
                'high': "Шағымдарыңыз қабылданды. Біздің операторлар жақын арада сізбен байланысады.",
                'medium': "Ақпаратыңыз үшін рахмет. Шағымдарыңыз қарастыруға қабылданды.",
                'low': "Хабарламаңыз үшін рахмет. Шағымдарыңыз тіркелді."
            },
            'kk': {
                'critical': "Сіздің шағымдарыңыз қабылданды. Жедел көмек жолға қойылды. Қауіпті жағдайда полицияға тікелей хабарласыңыз.",
                'high': "Шағымдарыңыз қабылданды. Біздің операторлар жақын арада сізбен байланысады.",
                'medium': "Ақпаратыңыз үшін рахмет. Шағымдарыңыз қарастыруға қабылданды.",
                'low': "Хабарламаңыз үшін рахмет. Шағымдарыңыз тіркелді."
            },
            'en': {
                'critical': "Your complaint has been received. Emergency assistance has been dispatched. In case of immediate danger, contact police directly.",
                'high': "Your complaint has been received. Our operators will contact you shortly.",
                'medium': "Thank you for the information. Your complaint has been accepted for review.",
                'low': "Thank you for your report. Your complaint has been registered."
            }
        }
        
        response = responses[self.language].get(urgency, responses[self.language]['medium'])
        logger.info(f"Generated response: {response}")
        return response

    def play_response(self, response_text):
        """Play response to caller."""
        self._play_text(response_text)
        self.call_data['response_played'] = True

    def log_call(self):
        """Log call details to database."""
        self.call_data['duration'] = (datetime.now() - self.call_start_time).total_seconds()
        self.call_data['status'] = 'completed'
        
        try:
            log_id = self.logger_service.log_call(self.call_data)
            logger.info(f"Call logged with ID: {log_id}")
            return log_id
        except Exception as e:
            logger.error(f"Failed to log call: {e}")
            return None

    def handle_call(self, caller_id, language='ru'):
        """
        Main call handling workflow.
        
        Args:
            caller_id: Caller's phone number
            language: Preferred language (ru/kk/en)
        """
        logger.info(f"=== Starting call handling for {caller_id} ===")
        
        try:
            # 1. Set caller info
            self.set_caller_info(caller_id, language)
            
            # 2. Play greeting
            self.play_greeting()
            
            # 3. Record initial response
            recording = self.record_response(duration=15)
            
            if recording:
                # 4. Transcribe audio
                transcript = self.transcribe_audio(recording)
                
                if transcript and len(transcript.strip()) > 10:
                    # 5. Analyze with AI
                    analysis = self.analyze_with_ai(transcript)
                    
                    # 6. Generate and play response
                    response = self.generate_response(analysis)
                    self.play_response(response)
                else:
                    # No speech detected or too short
                    logger.warning("No valid transcript detected")
                    no_speech_msg = {
                        'ru': "Сіздің дауысыңызды естіген жоқпын. Қайта байланысыңыз.",
                        'kk': "Сіздің дауысыңызды естіген жоқпын. Қайта байланысыңыз.",
                        'en': "I didn't hear your voice. Please call again."
                    }
                    self._play_text(no_speech_msg[self.language])
            else:
                logger.warning("No recording captured")
            
            # 7. Log call
            self.log_call()
            
            # 8. Play goodbye
            goodbye_msg = {
                'ru': "Сау болыңыз. Қоңырау аяқталды.",
                'kk': "Сау болыңыз. Қоңырау аяқталды.",
                'en': "Goodbye. Call ended."
            }
            self._play_text(goodbye_msg[self.language])
            
            logger.info("=== Call handling completed successfully ===")
            
        except Exception as e:
            logger.error(f"Error in call handling: {e}", exc_info=True)
            self.call_data['status'] = 'failed'
            self.call_data['error'] = str(e)
            self.log_call()
            
            # Play error message
            error_msg = {
                'ru': "Қате орын алды. Қайта байланысыңыз.",
                'kk': "Қате орын алды. Қайта байланысыңыз.",
                'en': "An error occurred. Please call again."
            }
            if self.agi:
                self._play_text(error_msg[self.language])


def main():
    """Main entry point for AGI script."""
    # Parse command line arguments
    if len(sys.argv) > 1:
        caller_id = sys.argv[1]
        language = sys.argv[2] if len(sys.argv) > 2 else 'ru'
    else:
        # Default values for testing
        caller_id = 'TEST_' + datetime.now().strftime('%H%M%S')
        language = 'ru'
    
    # Initialize AGI if available
    agi_instance = None
    if AGI_AVAILABLE:
        agi_instance = asterisk.agi.AGI()
        # Get caller ID from AGI if not provided
        if caller_id.startswith('TEST_'):
            caller_id = agi_instance.env['agi_callerid'] or caller_id
    
    # Create and run call handler
    handler = CallHandler(agi_instance)
    handler.handle_call(caller_id, language)
    
    # Exit cleanly
    if agi_instance:
        agi_instance.finish()


if __name__ == "__main__":
    main()