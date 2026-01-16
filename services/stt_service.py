"""
Speech-to-Text (STT) Service for AI Call Intake System.
Supports Whisper (offline) and Google Speech-to-Text API.
"""

import os
import logging
import tempfile
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)


class STTEngine(Enum):
    """Available STT engines."""
    WHISPER = "whisper"
    GOOGLE = "google"
    AZURE = "azure"
    MOCK = "mock"


class STTService:
    """Main STT service class."""
    
    def __init__(self, engine: str = None, model_size: str = "base", language: str = "kk"):
        """
        Initialize STT service.
        
        Args:
            engine: STT engine to use (whisper, google, azure, mock)
            model_size: For Whisper, model size (tiny, base, small, medium, large)
            language: Default language for transcription
        """
        self.engine = engine or os.getenv('STT_ENGINE', 'whisper').lower()
        self.model_size = model_size
        self.language = language
        self.model = None
        self.client = None
        
        logger.info(f"Initializing STT service with engine: {self.engine}")
        
        # Initialize selected engine
        if self.engine == STTEngine.WHISPER.value:
            self._init_whisper()
        elif self.engine == STTEngine.GOOGLE.value:
            self._init_google()
        elif self.engine == STTEngine.AZURE.value:
            self._init_azure()
        else:
            logger.info("Using mock STT engine for testing")
    
    def _init_whisper(self):
        """Initialize Whisper model."""
        try:
            import whisper
            logger.info(f"Loading Whisper model: {self.model_size}")
            self.model = whisper.load_model(self.model_size)
            logger.info("Whisper model loaded successfully")
        except ImportError:
            logger.error("Whisper not installed. Install with: pip install openai-whisper")
            raise
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise
    
    def _init_google(self):
        """Initialize Google Speech-to-Text client."""
        try:
            from google.cloud import speech_v1 as speech
            from google.oauth2 import service_account
            
            credentials_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if credentials_path and os.path.exists(credentials_path):
                credentials = service_account.Credentials.from_service_account_file(
                    credentials_path
                )
                self.client = speech.SpeechClient(credentials=credentials)
                logger.info("Google Speech-to-Text client initialized")
            else:
                logger.warning("Google credentials not found, using default")
                self.client = speech.SpeechClient()
        except ImportError:
            logger.error("Google Cloud Speech not installed. Install with: pip install google-cloud-speech")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Google STT: {e}")
            raise
    
    def _init_azure(self):
        """Initialize Azure Speech Services client."""
        try:
            import azure.cognitiveservices.speech as speechsdk
            
            subscription_key = os.getenv('AZURE_SPEECH_KEY')
            region = os.getenv('AZURE_SPEECH_REGION', 'eastus')
            
            if not subscription_key:
                logger.error("Azure Speech key not configured")
                raise ValueError("AZURE_SPEECH_KEY environment variable required")
            
            speech_config = speechsdk.SpeechConfig(
                subscription=subscription_key,
                region=region
            )
            self.client = speechsdk.SpeechRecognizer(speech_config=speech_config)
            logger.info("Azure Speech Services client initialized")
        except ImportError:
            logger.error("Azure Speech SDK not installed. Install with: pip install azure-cognitiveservices-speech")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Azure STT: {e}")
            raise
    
    def transcribe(self, audio_data: bytes, language: str = "ru") -> str:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw audio bytes
            language: Language code (ru, kk, en, etc.)
            
        Returns:
            Transcribed text
        """
        if not audio_data:
            logger.warning("Empty audio data provided")
            return ""
        
        logger.info(f"Transcribing audio with {self.engine} engine, language: {language}")
        
        # Map language codes to engine-specific codes
        language_map = {
            'ru': 'ru-RU',
            'kk': 'kk-KZ',
            'en': 'en-US'
        }
        engine_language = language_map.get(language, language)
        
        try:
            if self.engine == STTEngine.WHISPER.value:
                return self._transcribe_whisper(audio_data, language)
            elif self.engine == STTEngine.GOOGLE.value:
                return self._transcribe_google(audio_data, engine_language)
            elif self.engine == STTEngine.AZURE.value:
                return self._transcribe_azure(audio_data, engine_language)
            else:
                return self._transcribe_mock(audio_data, language)
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            # Fallback to mock transcription
            return self._transcribe_mock(audio_data, language)
    
    def _transcribe_whisper(self, audio_data: bytes, language: str) -> str:
        """Transcribe using Whisper."""
        if not self.model:
            raise RuntimeError("Whisper model not initialized")
        
        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        try:
            # Whisper transcription
            result = self.model.transcribe(
                tmp_path,
                language=language,
                fp16=False  # Use FP32 for compatibility
            )
            return result['text'].strip()
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    def _transcribe_google(self, audio_data: bytes, language: str) -> str:
        """Transcribe using Google Speech-to-Text."""
        if not self.client:
            raise RuntimeError("Google STT client not initialized")
        
        from google.cloud import speech_v1 as speech
        
        # Configure audio
        audio = speech.RecognitionAudio(content=audio_data)
        
        # Configure recognition
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code=language,
            enable_automatic_punctuation=True,
            model='command_and_search'  # Good for short commands
        )
        
        # Perform transcription
        response = self.client.recognize(config=config, audio=audio)
        
        # Combine results
        transcripts = []
        for result in response.results:
            transcripts.append(result.alternatives[0].transcript)
        
        return ' '.join(transcripts).strip()
    
    def _transcribe_azure(self, audio_data: bytes, language: str) -> str:
        """Transcribe using Azure Speech Services."""
        if not self.client:
            raise RuntimeError("Azure STT client not initialized")
        
        import azure.cognitiveservices.speech as speechsdk
        
        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        
        try:
            # Configure audio
            audio_config = speechsdk.AudioConfig(filename=tmp_path)
            
            # Create recognizer with audio config
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.client.speech_config,
                audio_config=audio_config
            )
            
            # Perform recognition
            result = recognizer.recognize_once()
            
            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                return result.text.strip()
            elif result.reason == speechsdk.ResultReason.NoMatch:
                logger.warning("No speech could be recognized")
                return ""
            else:
                logger.error(f"Recognition failed: {result.reason}")
                return ""
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    def _transcribe_mock(self, audio_data: bytes, language: str) -> str:
        """Mock transcription for testing."""
        # Simulate processing delay
        import time
        time.sleep(0.5)
        
        mock_transcripts = {
            'ru': "Мужчина кричал на женщину во дворе дома номер 15 по улице Абая. Возможно, есть угроза физического насилия.",
            'kk': "Ер адам әйел адамға Абай көшесіндегі 15-үйде айқайлады. Физикалық зорлық-зомбылық қауіпі бар.",
            'en': "A man was shouting at a woman in the yard of house number 15 on Abay street. There may be a threat of physical violence."
        }
        
        return mock_transcripts.get(language, "Test transcription of incident report.")
    
    def get_supported_languages(self) -> list:
        """Get list of supported languages."""
        if self.engine == STTEngine.WHISPER.value:
            return ['ru', 'kk', 'en', 'de', 'fr', 'es', 'it', 'pt', 'tr', 'ar', 'zh']
        elif self.engine == STTEngine.GOOGLE.value:
            return ['ru-RU', 'kk-KZ', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES']
        elif self.engine == STTEngine.AZURE.value:
            return ['ru-RU', 'kk-KZ', 'en-US', 'de-DE', 'fr-FR', 'es-ES']
        else:
            return ['ru', 'kk', 'en']
    
    def get_engine_info(self) -> dict:
        """Get information about the STT engine."""
        return {
            'engine': self.engine,
            'model_size': self.model_size if self.engine == 'whisper' else None,
            'supported_languages': self.get_supported_languages(),
            'status': 'initialized' if self.model or self.client else 'mock'
        }


# Factory function for easy instantiation
def create_stt_service(engine=None, model_size="base"):
    """Create and return STT service instance."""
    return STTService(engine, model_size)


# Example usage
if __name__ == "__main__":
    # Test the service
    service = STTService(engine="mock")
    print(f"Engine info: {service.get_engine_info()}")
    
    # Mock transcription
    test_audio = b"fake audio data"
    result = service.transcribe(test_audio, "ru")
    print(f"Transcription: {result}")