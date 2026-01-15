import os
import logging
from typing import Dict, Any, Optional, List
from openai import OpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ClassificationResult(BaseModel):
    """Результат классификации звонка через OpenAI."""
    categories: List[str]  # основные категории (пожар, медицинский, ДТП, криминал, ЧС, ложный, информационный)
    priority: str  # high, medium, low
    service_type: str  # fire, emergency, ambulance, police, other
    is_false_call: bool  # ложный вызов
    confidence: float  # уверенность
    extracted_info: Dict[str, Any]  # извлеченные сущности: адрес, количество пострадавших, оружие и т.д.
    summary: str  # краткое резюме
    recommended_action: str  # рекомендуемое действие


class OpenAIClassifierService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not set, OpenAI classifier will be disabled")
            self.client = None
        else:
            self.client = OpenAI(api_key=api_key)
        self.model = "gpt-3.5-turbo"  # можно использовать gpt-4 если доступно
        logger.info("OpenAIClassifierService initialized")

    def classify(self, text: str) -> ClassificationResult:
        """
        Классифицирует текст звонка с помощью OpenAI.
        """
        if not self.client or not text.strip():
            # Возвращаем результат по умолчанию
            return self._default_result(text)

        prompt = self._build_prompt(text)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=800,
            )
            result_text = response.choices[0].message.content.strip()
            return self._parse_response(result_text)
        except Exception as e:
            logger.error(f"OpenAI classification error: {e}")
            return self._default_result(text)

    def _system_prompt(self) -> str:
        return """Ты — система анализа экстренных звонков. Твоя задача:
1. Определить категорию звонка (пожар, медицинский, ДТП, криминал, ЧС, ложный, информационный).
2. Оценить приоритет (high, medium, low) на основе срочности и угрозы жизни.
3. Определить службу (fire, emergency, ambulance, police, other).
4. Выявить ложный вызов (true/false) на основе противоречий, абсурдности, шуток.
5. Извлечь ключевую информацию: адрес, количество пострадавших, наличие оружия, описание происшествия.
6. Дать краткое резюме и рекомендованное действие.

Ответ предоставь в формате JSON:
{
  "categories": ["категория1", "категория2"],
  "priority": "high/medium/low",
  "service_type": "fire/emergency/ambulance/police/other",
  "is_false_call": true/false,
  "confidence": 0.95,
  "extracted_info": {
    "address": "ул. Ленина, 5",
    "injured_count": 2,
    "weapon": false,
    "fire": true,
    "description": "горит квартира"
  },
  "summary": "Краткое резюме",
  "recommended_action": "Отправить пожарную бригаду"
}
"""

    def _build_prompt(self, text: str) -> str:
        return f"""
Текст звонка: "{text}"

Проанализируй и верни JSON как указано выше.
"""

    def _parse_response(self, response_text: str) -> ClassificationResult:
        import json
        try:
            # Извлечь JSON из текста (может быть обёрнут в markdown)
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start == -1 or end == 0:
                raise ValueError("No JSON found")
            json_str = response_text[start:end]
            data = json.loads(json_str)
            # Приведение типов
            categories = data.get("categories", [])
            if isinstance(categories, str):
                categories = [categories]
            priority = data.get("priority", "low")
            service_type = data.get("service_type", "other")
            is_false_call = bool(data.get("is_false_call", False))
            confidence = float(data.get("confidence", 0.5))
            extracted_info = data.get("extracted_info", {})
            summary = data.get("summary", "")
            recommended_action = data.get("recommended_action", "")
            return ClassificationResult(
                categories=categories,
                priority=priority,
                service_type=service_type,
                is_false_call=is_false_call,
                confidence=confidence,
                extracted_info=extracted_info,
                summary=summary,
                recommended_action=recommended_action
            )
        except Exception as e:
            logger.error(f"Failed to parse OpenAI response: {e}, response: {response_text}")
            return self._default_result("")

    def _default_result(self, text: str) -> ClassificationResult:
        """Результат по умолчанию при ошибке."""
        # Простая эвристика на основе текста
        text_lower = text.lower()
        categories = []
        if any(word in text_lower for word in ["пожар", "горит", "огонь"]):
            categories.append("пожар")
            service_type = "fire"
            priority = "high"
        elif any(word in text_lower for word in ["дтп", "авария", "столкновение"]):
            categories.append("ДТП")
            service_type = "police"
            priority = "high"
        elif any(word in text_lower for word in ["боль", "скорая", "врач", "медик"]):
            categories.append("медицинский")
            service_type = "ambulance"
            priority = "medium"
        elif any(word in text_lower for word in ["оружие", "драка", "нож", "грабеж"]):
            categories.append("криминал")
            service_type = "police"
            priority = "high"
        elif any(word in text_lower for word in ["чс", "наводнение", "землетрясение"]):
            categories.append("ЧС")
            service_type = "emergency"
            priority = "high"
        else:
            categories.append("информационный")
            service_type = "other"
            priority = "low"

        is_false_call = any(word in text_lower for word in ["шутка", "прикол", "ложный", "проверка"])
        return ClassificationResult(
            categories=categories,
            priority=priority,
            service_type=service_type,
            is_false_call=is_false_call,
            confidence=0.6,
            extracted_info={},
            summary="",
            recommended_action=""
        )