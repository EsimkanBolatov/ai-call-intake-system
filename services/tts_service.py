"""
Text-to-Speech (TTS) Service for AI Call Intake System.
Supports Coqui TTS (offline), OpenAI TTS, and Google TTS.
"""

import os
import logging
import tempfile
from pathlib import Path
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)


class TTSEngine(Enum):
    """Available TTS engines."""
    COQUI = "coqui"
    OPENAI = "openai"
    GOOGLE = "google"
    MOCK = "mock"


class TTSService:
    """Main TTS service class."""
    
    def __init__(self, engine: str = None, voice: str = None):
        """
        Initialize TTS service.
        
        Args:
            engine: TTS engine to use (coqui, openai, google, mock)
            voice: Voice name or ID
        """
        self.engine = engine or os.getenv('TTS_ENGINE', 'coqui').lower()
        self.voice = voice or os.getenv('TTS_VOICE', 'tts_models/multilingual/multi-dataset/xtts_v2')
        self.model = None
        self.client = None
        self.output_dir = Path(os.getenv('TTS_OUTPUT_DIR', '/tmp/tts_output'))
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Initializing TTS service with engine: {self.engine}, voice: {self.voice}")
        
        # Initialize selected engine
        if self.engine == TTSEngine.COQUI.value:
            self._init_coqui()
        elif self.engine == TTSEngine.OPENAI.value:
            self._init_openai()
        elif self.engine == TTSEngine.GOOGLE.value:
            self._init_google()
        else:
            logger.info("Using mock TTS engine for testing")
    
    def _init_coqui(self):
        """Initialize Coqui TTS model."""
        try:
            from TTS.api import TTS
            
            logger.info(f"Loading Coqui TTS model: {self.voice}")
            self.model = TTS(self.voice)
            logger.info("Coqui TTS model loaded successfully")
            
            # Available languages for XTTS v2
            self.supported_languages = ['ru', 'kk', 'en', 'de', 'fr', 'es', 'it', 'pt', 'tr', 'ar', 'zh']
            
        except ImportError:
            logger.error("Coqui TTS not installed. Install with: pip install TTS")
            raise
        except Exception as e:
            logger.error(f"Failed to load Coqui TTS model: {e}")
            raise
    
    def _init_openai(self):
        """Initialize OpenAI TTS client."""
        try:
            from openai import OpenAI
            
            self.api_key = os.getenv('OPENAI_API_KEY')
            if not self.api_key:
                logger.warning("OPENAI_API_KEY not set, using mock mode")
                self.engine = 'mock'
                return
            
            self.client = OpenAI(api_key=self.api_key)
            logger.info("OpenAI TTS client initialized")
            
            # Available voices
            self.supported_voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
            self.supported_languages = ['en']  # OpenAI TTS primarily English
            
        except ImportError:
            logger.error("OpenAI not installed. Install with: pip install openai")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI TTS: {e}")
            raise
    
    def _init_google(self):
        """Initialize Google Text-to-Speech client."""
        try:
            from google.cloud import texttospeech
            
            credentials_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if credentials_path and os.path.exists(credentials_path):
                self.client = texttospeech.TextToSpeechClient.from_service_account_file(credentials_path)
            else:
                self.client = texttospeech.TextToSpeechClient()
            
            logger.info("Google Text-to-Speech client initialized")
            
            # Available languages and voices
            self.supported_languages = ['ru-RU', 'kk-KZ', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES']
            
        except ImportError:
            logger.error("Google Cloud TTS not installed. Install with: pip install google-cloud-texttospeech")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Google TTS: {e}")
            raise
    
    def text_to_speech(self, text: str, language: str = "ru", 
                      output_format: str = "wav") -> Optional[str]:
        """
        Convert text to speech audio file.
        
        Args:
            text: Text to convert
            language: Language code (ru, kk, en, etc.)
            output_format: Output audio format (wav, mp3)
            
        Returns:
            Path to generated audio file or None
        """
        if not text or len(text.strip()) == 0:
            logger.warning("Empty text provided for TTS")
            return None
        
        logger.info(f"Converting text to speech with {self.engine} engine, language: {language}")
        
        try:
            if self.engine == TTSEngine.COQUI.value:
                return self._tts_coqui(text, language, output_format)
            elif self.engine == TTSEngine.OPENAI.value:
                return self._tts_openai(text, language, output_format)
            elif self.engine == TTSEngine.GOOGLE.value:
                return self._tts_google(text, language, output_format)
            else:
                return self._tts_mock(text, language, output_format)
        except Exception as e:
            logger.error(f"TTS conversion failed: {e}")
            # Fallback to mock TTS
            return self._tts_mock(text, language, output_format)
    
    def _tts_coqui(self, text: str, language: str, output_format: str) -> Optional[str]:
        """Convert text to speech using Coqui TTS."""
        if not self.model:
            raise RuntimeError("Coqui TTS model not initialized")
        
        # Map language codes
        language_map = {
            'ru': 'ru',
            'kk': 'kk',  # Note: Kazakh might not be fully supported
            'en': 'en'
        }
        tts_language = language_map.get(language, 'ru')
        
        # Create temporary output file
        with tempfile.NamedTemporaryFile(suffix=f'.{output_format}', delete=False) as tmp:
            output_path = tmp.name
        
        try:
            # Generate speech
            # XTTS v2 requires speaker_wav for cloning, but we can use default
            self.model.tts_to_file(
                text=text,
                file_path=output_path,
                language=tts_language,
                # speaker_wav="path/to/speaker.wav"  # Optional: for voice cloning
            )
            
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"Coqui TTS audio generated: {output_path}")
                return output_path
            else:
                logger.error("Coqui TTS failed to generate audio")
                return None
                
        except Exception as e:
            logger.error(f"Coqui TTS error: {e}")
            # Clean up failed file
            try:
                os.unlink(output_path)
            except:
                pass
            return None
    
    def _tts_openai(self, text: str, language: str, output_format: str) -> Optional[str]:
        """Convert text to speech using OpenAI TTS."""
        if not self.client:
            raise RuntimeError("OpenAI TTS client not initialized")
        
        # OpenAI TTS currently only supports English well
        # We'll use English voice regardless of language for simplicity
        voice = self.voice if self.voice in ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] else 'nova'
        
        # Create temporary output file
        with tempfile.NamedTemporaryFile(suffix=f'.{output_format}', delete=False) as tmp:
            output_path = tmp.name
        
        try:
            response = self.client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text
            )
            
            # Save audio
            response.stream_to_file(output_path)
            
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"OpenAI TTS audio generated: {output_path}")
                return output_path
            else:
                logger.error("OpenAI TTS failed to generate audio")
                return None
                
        except Exception as e:
            logger.error(f"OpenAI TTS error: {e}")
            # Clean up failed file
            try:
                os.unlink(output_path)
            except:
                pass
            return None
    
    def _tts_google(self, text: str, language: str, output_format: str) -> Optional[str]:
        """Convert text to speech using Google TTS."""
        if not self.client:
            raise RuntimeError("Google TTS client not initialized")
        
        from google.cloud import texttospeech
        
        # Map language codes
        language_map = {
            'ru': 'ru-RU',
            'kk': 'kk-KZ',
            'en': 'en-US'
        }
        tts_language = language_map.get(language, 'ru-RU')
        
        # Set voice parameters
        voice = texttospeech.VoiceSelectionParams(
            language_code=tts_language,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        
        # Set audio format
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16 if output_format == 'wav' 
                         else texttospeech.AudioEncoding.MP3
        )
        
        # Create temporary output file
        with tempfile.NamedTemporaryFile(suffix=f'.{output_format}', delete=False) as tmp:
            output_path = tmp.name
        
        try:
            # Generate speech
            synthesis_input = texttospeech.SynthesisInput(text=text)
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            # Write audio content to file
            with open(output_path, 'wb') as out:
                out.write(response.audio_content)
            
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"Google TTS audio generated: {output_path}")
                return output_path
            else:
                logger.error("Google TTS failed to generate audio")
                return None
                
        except Exception as e:
            logger.error(f"Google TTS error: {e}")
            # Clean up failed file
            try:
                os.unlink(output_path)
            except:
                pass
            return None
    
    def _tts_mock(self, text: str, language: str, output_format: str) -> Optional[str]:
        """Mock TTS for testing - creates empty audio file."""
        # Simulate processing delay
        import time
        time.sleep(0.2)
        
        # Create empty audio file for testing
        with tempfile.NamedTemporaryFile(suffix=f'.{output_format}', delete=False) as tmp:
            output_path = tmp.name
        
        # Write minimal WAV header (empty audio)
        if output_format == 'wav':
            # Minimal WAV header for empty audio (44 bytes)
            wav_header = bytes([
                0x52, 0x49, 0x46, 0x46,  # 'RIFF'
                0x24, 0x00, 0x00, 0x00,  # File size - 36
                0x57, 0x41, 0x56, 0x45,  # 'WAVE'
                0x66, 0x6D, 0x74, 0x20,  # 'fmt '
                0x10, 0x00, 0x00, 0x00,  # Subchunk size
                0x01, 0x00,  # Audio format PCM
                0x01, 0x00,  # Mono
                0x80, 0x3E, 0x00, 0x00,  # Sample rate 16000
                0x00, 0x7D, 0x00, 0x00,  # Byte rate
                0x02, 0x00,  # Block align
                0x10, 0x00,  # Bits per sample
                0x64, 0x61, 0x74, 0x61,  # 'data'
                0x00, 0x00, 0x00, 0x00   # Data size (0)
            ])
            with open(output_path, 'wb') as f:
                f.write(wav_header)
        else:
            # For other formats, just create empty file
            with open(output_path, 'wb') as f:
                f.write(b'')
        
        logger.info(f"Mock TTS audio generated: {output_path} (empty file)")
        return output_path
    
    def get_supported_languages(self) -> list:
        """Get list of supported languages."""
        if hasattr(self, 'supported_languages'):
            return self.supported_languages
        else:
            return ['ru', 'kk', 'en']
    
    def get_engine_info(self) -> dict:
        """Get information about the TTS engine."""
        info = {
            'engine': self.engine,
            'voice': self.voice,
            'supported_languages': self.get_supported_languages(),
            'output_dir': str(self.output_dir),
            'status': 'initialized' if self.model or self.client else 'mock'
        }
        
        if self.engine == TTSEngine.OPENAI.value and hasattr(self, 'supported_voices'):
            info['available_voices'] = self.supported_voices
        
        return info
    
    def cleanup_old_files(self, max_age_hours: int = 24):
        """Clean up old TTS audio files."""
        import time
        current_time = time.time()
        
        for file_path in self.output_dir.glob('*.wav'):
            try:
                file_age = current_time - os.path.getmtime(file_path)
                if file_age > max_age_hours * 3600:
                    os.unlink(file_path)
                    logger.debug(f"Cleaned up old TTS file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up file {file_path}: {e}")


# Factory function for easy instantiation
def create_tts_service(engine=None, voice=None):
    """Create and return TTS service instance."""
    return TTSService(engine, voice)


# Example usage
if __name__ == "__main__":
    # Test the service
    service = TTSService(engine="mock")
    print(f"Engine info: {service.get_engine_info()}")
    
    # Mock TTS
    test_text = "Это тестовое сообщение для проверки TTS."
    result = service.text_to_speech(test_text, "ru")
    print(f"Generated audio: {result}")
    
    if result and os.path.exists(result):
        print(f"File size: {os.path.getsize(result)} bytes")
        # Clean up
        os.unlink(result)