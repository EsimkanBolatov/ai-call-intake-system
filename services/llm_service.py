"""
LLM Service for AI Call Intake System.
Supports OpenAI GPT, DeepSeek, and local models for incident analysis.
"""

import os
import json
import logging
import re
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class LLMEngine(Enum):
    """Available LLM engines."""
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    OLLAMA = "ollama"
    MOCK = "mock"


class LLMService:
    """Main LLM service class for incident analysis."""
    
    def __init__(self, engine: str = None, model: str = None, api_key: str = None):
        """
        Initialize LLM service.
        
        Args:
            engine: LLM engine to use (openai, deepseek, ollama, mock)
            model: Model name (gpt-4, gpt-3.5-turbo, deepseek-chat, etc.)
            api_key: API key for the LLM service
        """
        self.engine = engine or os.getenv('LLM_ENGINE', 'openai').lower()
        self.model = model or os.getenv('LLM_MODEL', 'gpt-3.5-turbo')
        self.client = None
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        
        logger.info(f"Initializing LLM service with engine: {self.engine}, model: {self.model}")
        
        # Initialize selected engine
        if self.engine == LLMEngine.OPENAI.value:
            self._init_openai()
        elif self.engine == LLMEngine.DEEPSEEK.value:
            self._init_deepseek()
        elif self.engine == LLMEngine.OLLAMA.value:
            self._init_ollama()
        else:
            logger.info("Using mock LLM engine for testing")
    
    def _init_openai(self):
        """Initialize OpenAI client."""
        try:
            from openai import OpenAI
            
            self.api_key = os.getenv('OPENAI_API_KEY')
            if not self.api_key:
                logger.warning("OPENAI_API_KEY not set, using mock mode")
                self.engine = 'mock'
                return
            
            self.client = OpenAI(api_key=self.api_key)
            logger.info("OpenAI client initialized")
        except ImportError:
            logger.error("OpenAI not installed. Install with: pip install openai")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI: {e}")
            raise
    
    def _init_deepseek(self):
        """Initialize DeepSeek client."""
        try:
            from openai import OpenAI
            
            self.api_key = os.getenv('DEEPSEEK_API_KEY')
            if not self.api_key:
                logger.warning("DEEPSEEK_API_KEY not set, using mock mode")
                self.engine = 'mock'
                return
            
            self.client = OpenAI(
                api_key=self.api_key,
                base_url="https://api.deepseek.com"
            )
            logger.info("DeepSeek client initialized")
        except ImportError:
            logger.error("OpenAI package required for DeepSeek. Install with: pip install openai")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize DeepSeek: {e}")
            raise
    
    def _init_ollama(self):
        """Initialize Ollama client for local models."""
        try:
            from openai import OpenAI
            
            ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434/v1')
            self.client = OpenAI(
                base_url=ollama_base_url,
                api_key='ollama'  # Ollama doesn't require real API key
            )
            logger.info(f"Ollama client initialized with base URL: {ollama_base_url}")
        except ImportError:
            logger.error("OpenAI package required for Ollama. Install with: pip install openai")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Ollama: {e}")
            raise
    
    def analyze_incident(self, transcript: str, language: str = "ru") -> Dict[str, Any]:
        """
        Analyze incident transcript and extract structured information.
        
        Args:
            transcript: Caller's speech transcript
            language: Language of the transcript
            
        Returns:
            Dictionary with structured analysis
        """
        if not transcript or len(transcript.strip()) < 5:
            logger.warning("Transcript too short for analysis")
            return self._get_default_response()
        
        logger.info(f"Analyzing incident transcript (language: {language})")
        
        try:
            if self.engine == LLMEngine.OPENAI.value:
                return self._analyze_with_openai(transcript, language)
            elif self.engine == LLMEngine.DEEPSEEK.value:
                return self._analyze_with_deepseek(transcript, language)
            elif self.engine == LLMEngine.OLLAMA.value:
                return self._analyze_with_ollama(transcript, language)
            else:
                return self._analyze_mock(transcript, language)
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            # Fallback to mock analysis
            return self._analyze_mock(transcript, language)
    
    def _build_system_prompt(self, language: str) -> str:
        """Build system prompt for incident analysis."""
        
        prompts = {
            'ru': """Ты - автоматический помощник службы 102 (полиция Казахстана). 
Твоя задача: анализировать сообщения граждан и извлекать структурированную информацию.

ТЫ НЕ ЯВЛЯЕШЬСЯ:
- Диспетчером полиции
- Юристом
- Консультантом
- Специалистом по безопасности

ТВОИ ОГРАНИЧЕНИЯ:
- Не давай советов
- Не обещай помощи
- Не оценивай ситуацию как эксперт
- Не выражай эмоции

ТВОЯ ЗАДАЧА:
1. Извлеки факты из сообщения
2. Классифицируй инцидент
3. Определи срочность
4. Заполни JSON структуру

ВОЗМОЖНЫЕ КАТЕГОРИИ:
- theft: кража, грабеж
- assault: нападение, избиение
- domestic: домашнее насилие
- noise: нарушение тишины
- traffic: ДТП, нарушение ПДД
- public_order: нарушение общественного порядка
- missing_person: пропажа человека
- vandalism: вандализм
- fraud: мошенничество
- other: другое

СРОЧНОСТЬ (urgency):
- critical: непосредственная угроза жизни, активное насилие, вооруженное нападение
- high: серьезное преступление в процессе, потенциальная опасность
- medium: преступление уже совершено, нет непосредственной угрозы
- low: незначительные нарушения, информационные сообщения

ВСЕГДА ОТВЕЧАЙ ТОЛЬКО В ФОРМАТЕ JSON:
{
  "urgency": "critical|high|medium|low",
  "category": "category_from_list",
  "address": "извлеченный адрес или 'не указан'",
  "current_danger": true/false,
  "people_involved": число,
  "weapons": true/false,
  "recommended_department": "Полиция|Скорая|МЧС|Акимат",
  "summary": "краткое описание на русском (1-2 предложения)",
  "needs_clarification": true/false,
  "clarification_questions": ["вопрос1", "вопрос2"]
}

Если информации недостаточно, установи needs_clarification: true и предложи уточняющие вопросы.""",
            
            'kk': """Сен - 102 қызметінің (Қазақстан полициясы) автоматты көмекшісісің.
Сенің міндетің: азаматтардың хабарламаларын талдап, құрылымды ақпаратты шығару.

СЕН ЕМЕССІҢ:
- Полиция диспетчері
- Заңгер
- Кеңесші
- Қауіпсіздік маманы

СЕНІҢ ШЕКТЕУЛЕРІҢ:
- Кеңес берме
- Көмек уәде етпе
- Эксперт ретінде жағдайды бағалама
- Эмоцияларды білдірме

СЕНІҢ МІНДЕТІҢ:
1. Хабарламадан фактілерді шығар
2. Оқиғаны жікте
3. Шұғылдықты анықта
4. JSON құрылымын толтыр

МҮМКІН САНАТТАР:
- theft: ұрлық, тонау
- assault: шабуыл, ұрыс
- domestic: отбасылық зорлық-зомбылық
- noise: тыныштықты бұзу
- traffic: ЖКҚ, ЖЕК бұзу
- public_order: қоғамдық тәртіпті бұзу
- missing_person: адамның жоғалуы
- vandalism: вандализм
- fraud: алаяқтық
- other: басқа

ШҰҒЫЛДЫҚ (urgency):
- critical: тікелей өмірге қауіп, белсенді зорлық-зомбылық, қарулы шабуыл
- high: үдерістегі ауыр қылмыс, ықтимал қауіп
- medium: қылмыс жасалып болды, тікелей қауіп жоқ
- low: шамалы бұзушылықтар, ақпараттық хабарламалар

ӘРҚАШАН ТЕК JSON ФОРМАТЫНДА ЖАУАП БЕР:
{
  "urgency": "critical|high|medium|low",
  "category": "category_from_list",
  "address": "шығарылған мекенжай немесе 'көрсетілмеген'",
  "current_danger": true/false,
  "people_involved": сан,
  "weapons": true/false,
  "recommended_department": "Полиция|Жедел жәрдем|ІІЖМ|Әкімат",
  "summary": "қысқа сипаттама (1-2 сөйлем)",
  "needs_clarification": true/false,
  "clarification_questions": ["сұрақ1", "сұрақ2"]
}

Ақпарат жеткіліксіз болса, needs_clarification: true деп белгіле және нақтылау сұрақтарын ұсын.""",
            
            'en': """You are an automated assistant for 102 service (Kazakhstan Police).
Your task: analyze citizen reports and extract structured information.

YOU ARE NOT:
- A police dispatcher
- A lawyer
- A consultant
- A security specialist

YOUR LIMITATIONS:
- Do not give advice
- Do not promise help
- Do not evaluate situations as an expert
- Do not express emotions

YOUR TASK:
1. Extract facts from the message
2. Classify the incident
3. Determine urgency
4. Fill JSON structure

POSSIBLE CATEGORIES:
- theft: theft, robbery
- assault: assault, beating
- domestic: domestic violence
- noise: noise violation
- traffic: accident, traffic violation
- public_order: public order violation
- missing_person: missing person
- vandalism: vandalism
- fraud: fraud
- other: other

URGENCY (urgency):
- critical: immediate threat to life, active violence, armed attack
- high: serious crime in progress, potential danger
- medium: crime already committed, no immediate threat
- low: minor violations, informational reports

ALWAYS RESPOND ONLY IN JSON FORMAT:
{
  "urgency": "critical|high|medium|low",
  "category": "category_from_list",
  "address": "extracted address or 'not specified'",
  "current_danger": true/false,
  "people_involved": number,
  "weapons": true/false,
  "recommended_department": "Police|Ambulance|Emergency|Akimat",
  "summary": "brief description in English (1-2 sentences)",
  "needs_clarification": true/false,
  "clarification_questions": ["question1", "question2"]
}

If information is insufficient, set needs_clarification: true and suggest clarification questions."""
        }
        
        return prompts.get(language, prompts['en'])
    
    def _analyze_with_openai(self, transcript: str, language: str) -> Dict[str, Any]:
        """Analyze with OpenAI GPT."""
        if not self.client:
            raise RuntimeError("OpenAI client not initialized")
        
        system_prompt = self._build_system_prompt(language)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript}
                ],
                temperature=0.1,  # Low temperature for consistent output
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            return self._parse_llm_response(result_text)
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise
    
    def _analyze_with_deepseek(self, transcript: str, language: str) -> Dict[str, Any]:
        """Analyze with DeepSeek."""
        if not self.client:
            raise RuntimeError("DeepSeek client not initialized")
        
        system_prompt = self._build_system_prompt(language)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript}
                ],
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content
            return self._parse_llm_response(result_text)
            
        except Exception as e:
            logger.error(f"DeepSeek API error: {e}")
            raise
    
    def _analyze_with_ollama(self, transcript: str, language: str) -> Dict[str, Any]:
        """Analyze with Ollama local model."""
        if not self.client:
            raise RuntimeError("Ollama client not initialized")
        
        system_prompt = self._build_system_prompt(language)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript}
                ],
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content
            return self._parse_llm_response(result_text)
            
        except Exception as e:
            logger.error(f"Ollama API error: {e}")
            raise
    
    def _analyze_mock(self, transcript: str, language: str) -> Dict[str, Any]:
        """Mock analysis for testing."""
        # Simulate processing delay
        import time
        time.sleep(0.3)
        
        # Simple keyword-based analysis
        transcript_lower = transcript.lower()
        
        # Determine urgency
        if any(word in transcript_lower for word in ['кричит', 'бьет', 'оружие', 'угрожает', 'сейчас', 'немедленно']):
            urgency = 'high'
            current_danger = True
        elif any(word in transcript_lower for word in ['украли', 'украл', 'грабеж', 'напали']):
            urgency = 'medium'
            current_danger = False
        else:
            urgency = 'low'
            current_danger = False
        
        # Determine category
        if any(word in transcript_lower for word in ['украл', 'украли', 'вор', 'кража']):
            category = 'theft'
        elif any(word in transcript_lower for word in ['бьет', 'избивает', 'напал', 'драка']):
            category = 'assault'
        elif any(word in transcript_lower for word in ['муж', 'жена', 'семья', 'домашний']):
            category = 'domestic'
        elif any(word in transcript_lower for word in ['шум', 'кричит', 'громко']):
            category = 'noise'
        else:
            category = 'other'
        
        # Extract address (mock)
        address = 'не указан'
        if 'улица' in transcript_lower or 'дом' in transcript_lower:
            address = 'ул. Примерная, 15'
        
        return {
            "urgency": urgency,
            "category": category,
            "address": address,
            "current_danger": current_danger,
            "people_involved": 2,
            "weapons": False,
            "recommended_department": "Полиция",
            "summary": "Гражданин сообщает о инциденте. Требуется проверка.",
            "needs_clarification": False,
            "clarification_questions": []
        }
    
    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """Parse LLM response and ensure valid JSON."""
        try:
            # Clean response text
            response_text = response_text.strip()
            
            # Extract JSON if response contains other text
            if '```json' in response_text:
                # Extract content between ```json and ```
                start = response_text.find('```json') + 7
                end = response_text.find('```', start)
                if end != -1:
                    response_text = response_text[start:end].strip()
            elif '```' in response_text:
                # Extract content between ``` and ```
                start = response_text.find('```') + 3
                end = response_text.find('```', start)
                if end != -1:
                    response_text = response_text[start:end].strip()
            
            # Parse JSON
            result = json.loads(response_text)
            
            # Validate required fields
            required_fields = ['urgency', 'category', 'address', 'current_danger',
                             'people_involved', 'weapons', 'recommended_department', 'summary']
            
            for field in required_fields:
                if field not in result:
                    result[field] = self._get_default_value(field)
            
            # Ensure correct types
            result['current_danger'] = bool(result.get('current_danger', False))
            result['weapons'] = bool(result.get('weapons', False))
            result['people_involved'] = int(result.get('people_involved', 0))
            
            # Validate urgency
            if result['urgency'] not in ['critical', 'high', 'medium', 'low']:
                result['urgency'] = 'medium'
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response text: {response_text}")
            return self._get_default_response()
        except Exception as e:
            logger.error(f"Error parsing LLM response: {e}")
            return self._get_default_response()
    
    def _get_default_response(self) -> Dict[str, Any]:
        """Get default response when analysis fails."""
        return {
            "urgency": "medium",
            "category": "other",
            "address": "не указан",
            "current_danger": False,
            "people_involved": 0,
            "weapons": False,
            "recommended_department": "Полиция",
            "summary": "Анализ не удался. Требуется ручная проверка.",
            "needs_clarification": False,
            "clarification_questions": []
        }
    
    def _get_default_value(self, field: str) -> Any:
        """Get default value for a field."""
        defaults = {
            'urgency': 'medium',
            'category': 'other',
            'address': 'не указан',
            'current_danger': False,
            'people_involved': 0,
            'weapons': False,
            'recommended_department': 'Полиция',
            'summary': 'Информация отсутствует',
            'needs_clarification': False,
            'clarification_questions': []
        }
        return defaults.get(field, '')
    
    def get_engine_info(self) -> Dict[str, Any]:
        """Get information about the LLM engine."""
        return {
            'engine': self.engine,
            'model': self.model,
            'status': 'initialized' if self.client or self.engine == 'mock' else 'failed',
            'supports_json': True
        }


# Factory function for easy instantiation
def create_llm_service(engine=None, model=None):
    """Create and return LLM service instance."""
    return LLMService(engine, model)


# Example usage
if __name__ == "__main__":
    # Test the service
    service = LLMService(engine="mock")
    print(f"Engine info: {service.get_engine_info()}")
    
    # Mock analysis
    test_transcript = "Мужчина кричит на женщину во дворе дома номер 15 по улице Абая."
    result = service.analyze_incident(test_transcript, "ru")
    print(f"Analysis result: {json.dumps(result, indent=2, ensure_ascii=False)}")
