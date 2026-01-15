"""
Incident Classifier for AI Call Intake System.
Provides rule-based classification and validation of LLM analysis.
"""

import json
import logging
from typing import Dict, Any, List, Tuple
import re

logger = logging.getLogger(__name__)


class IncidentClassifier:
    """Classifier for incident analysis with rule-based validation."""
    
    def __init__(self):
        """Initialize classifier with rules and categories."""
        self.categories = {
            'theft': {
                'keywords': ['украл', 'украли', 'вор', 'кража', 'грабеж', 'украли', 'похитил', 'похитили'],
                'urgency_default': 'medium',
                'department': 'Полиция'
            },
            'assault': {
                'keywords': ['бьет', 'избивает', 'напал', 'драка', 'ударил', 'ударили', 'избиение', 'нападение'],
                'urgency_default': 'high',
                'department': 'Полиция'
            },
            'domestic': {
                'keywords': ['муж', 'жена', 'семья', 'домашний', 'супруг', 'супруга', 'семейный', 'бытовой'],
                'urgency_default': 'high',
                'department': 'Полиция'
            },
            'noise': {
                'keywords': ['шум', 'кричит', 'громко', 'музыка', 'ор', 'крик', 'шумит'],
                'urgency_default': 'low',
                'department': 'Полиция'
            },
            'traffic': {
                'keywords': ['дтп', 'авария', 'машина', 'автомобиль', 'водитель', 'пешеход', 'светофор', 'пдд'],
                'urgency_default': 'high',
                'department': 'Полиция'
            },
            'public_order': {
                'keywords': ['пьяный', 'дебош', 'хулиган', 'нарушение', 'порядок', 'общественный'],
                'urgency_default': 'medium',
                'department': 'Полиция'
            },
            'missing_person': {
                'keywords': ['пропал', 'пропала', 'исчез', 'потерялся', 'не вернулся', 'пропал человек'],
                'urgency_default': 'high',
                'department': 'Полиция'
            },
            'vandalism': {
                'keywords': ['разбил', 'разрушил', 'испортил', 'вандализм', 'граффити', 'повредил'],
                'urgency_default': 'medium',
                'department': 'Полиция'
            },
            'fraud': {
                'keywords': ['мошенник', 'обман', 'афера', 'кибер', 'карта', 'деньги', 'банк'],
                'urgency_default': 'medium',
                'department': 'Полиция'
            },
            'fire': {
                'keywords': ['пожар', 'горит', 'дым', 'пламя', 'огонь', 'загорелся'],
                'urgency_default': 'critical',
                'department': 'МЧС'
            },
            'medical': {
                'keywords': ['больно', 'ранен', 'травма', 'скорая', 'врач', 'медицинская', 'кровь', 'сердце'],
                'urgency_default': 'critical',
                'department': 'Скорая'
            },
            'other': {
                'keywords': [],
                'urgency_default': 'low',
                'department': 'Полиция'
            }
        }
        
        # Danger indicators
        self.danger_indicators = [
            'оружие', 'нож', 'пистолет', 'револьвер', 'автомат', 'граната',
            'угрожает', 'убить', 'смерть', 'опасность', 'угроза', 'критический',
            'сейчас', 'немедленно', 'сию минуту', 'прямо сейчас'
        ]
        
        # Weapon indicators
        self.weapon_indicators = [
            'оружие', 'нож', 'пистолет', 'револьвер', 'автомат', 'граната',
            'бита', 'дубинка', 'топор', 'молоток', 'кастет'
        ]
        
        # Address patterns
        self.address_patterns = [
            r'улица\s+([\w\s]+)\s*,\s*(?:дом|д\.?)\s*(\d+)',
            r'ул\.\s*([\w\s]+)\s*,\s*(?:дом|д\.?)\s*(\d+)',
            r'([\w\s]+)\s*улица\s*,\s*(?:дом|д\.?)\s*(\d+)',
            r'дом\s*(\d+)\s*по\s*улице\s*([\w\s]+)',
            r'(\d+)\s*дом\s*на\s*([\w\s]+)'
        ]
        
        logger.info("IncidentClassifier initialized with %d categories", len(self.categories))
    
    def classify(self, llm_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and enhance LLM classification with rule-based logic.
        
        Args:
            llm_result: LLM analysis result
            
        Returns:
            Enhanced classification result
        """
        logger.info("Validating and enhancing LLM classification")
        
        # Create a copy to avoid modifying original
        result = llm_result.copy()
        
        # Extract text for keyword analysis (if available)
        text = result.get('summary', '').lower() + ' ' + result.get('transcript', '').lower()
        
        # 1. Validate category
        category = result.get('category', 'other')
        if category not in self.categories:
            # Try to determine category from keywords
            detected_category = self._detect_category_from_text(text)
            result['category'] = detected_category
            logger.info(f"Category corrected from '{category}' to '{detected_category}'")
        
        # 2. Validate urgency
        urgency = result.get('urgency', 'medium')
        category_info = self.categories.get(result['category'], self.categories['other'])
        
        # Adjust urgency based on danger indicators
        if self._has_danger_indicators(text):
            if urgency != 'critical':
                result['urgency'] = 'high'
                logger.info(f"Urgency elevated to 'high' due to danger indicators")
        
        # Ensure urgency is not lower than category default
        urgency_levels = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}
        category_default = category_info['urgency_default']
        
        if urgency_levels.get(urgency, 2) < urgency_levels.get(category_default, 2):
            result['urgency'] = category_default
            logger.info(f"Urgency adjusted to category default: {category_default}")
        
        # 3. Validate current_danger
        current_danger = result.get('current_danger', False)
        if not current_danger and self._has_immediate_danger_indicators(text):
            result['current_danger'] = True
            logger.info("Current danger set to True based on indicators")
        
        # 4. Validate weapons
        weapons = result.get('weapons', False)
        if not weapons and self._has_weapon_indicators(text):
            result['weapons'] = True
            logger.info("Weapons detected from text")
        
        # 5. Validate people_involved
        people_involved = result.get('people_involved', 0)
        if people_involved <= 0:
            # Try to extract from text
            extracted_people = self._extract_people_count(text)
            if extracted_people > 0:
                result['people_involved'] = extracted_people
                logger.info(f"People involved extracted: {extracted_people}")
        
        # 6. Validate recommended_department
        department = result.get('recommended_department', '')
        if not department or department == 'не указан':
            result['recommended_department'] = category_info['department']
            logger.info(f"Department set to: {category_info['department']}")
        
        # 7. Extract address if missing
        address = result.get('address', '')
        if not address or address in ['не указан', 'not specified', 'көрсетілмеген']:
            extracted_address = self._extract_address(text)
            if extracted_address:
                result['address'] = extracted_address
                logger.info(f"Address extracted: {extracted_address}")
        
        # 8. Add confidence score
        result['confidence_score'] = self._calculate_confidence(result, text)
        
        # 9. Add validation flags
        result['validated'] = True
        result['validation_notes'] = self._generate_validation_notes(result)
        
        logger.info(f"Classification complete. Final category: {result['category']}, urgency: {result['urgency']}")
        return result
    
    def _detect_category_from_text(self, text: str) -> str:
        """Detect category from text using keyword matching."""
        text_lower = text.lower()
        
        category_scores = {}
        for category, info in self.categories.items():
            score = 0
            for keyword in info['keywords']:
                if keyword in text_lower:
                    score += 1
            
            # Also check for partial matches
            for keyword in info['keywords']:
                if keyword in text_lower:
                    score += 0.5
            
            category_scores[category] = score
        
        # Find category with highest score
        if category_scores:
            best_category = max(category_scores.items(), key=lambda x: x[1])[0]
            if category_scores[best_category] > 0:
                return best_category
        
        return 'other'
    
    def _has_danger_indicators(self, text: str) -> bool:
        """Check if text contains danger indicators."""
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in self.danger_indicators)
    
    def _has_immediate_danger_indicators(self, text: str) -> bool:
        """Check if text contains immediate danger indicators."""
        text_lower = text.lower()
        immediate_indicators = ['сейчас', 'немедленно', 'сию минуту', 'прямо сейчас', 'в данный момент']
        return any(indicator in text_lower for indicator in immediate_indicators) and self._has_danger_indicators(text)
    
    def _has_weapon_indicators(self, text: str) -> bool:
        """Check if text contains weapon indicators."""
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in self.weapon_indicators)
    
    def _extract_people_count(self, text: str) -> int:
        """Extract number of people involved from text."""
        text_lower = text.lower()
        
        # Patterns for numbers
        patterns = [
            r'(\d+)\s*(?:человек|людей|люди|чел)',
            r'(\d+)\s*(?:мужчин|женщин|детей)',
            r'около\s*(\d+)\s*(?:человек|людей)',
            r'несколько\s*(?:человек|людей)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                try:
                    return int(match.group(1))
                except (ValueError, IndexError):
                    pass
        
        # Check for specific words
        if 'один' in text_lower or '1' in text:
            return 1
        elif 'два' in text_lower or '2' in text or 'пара' in text_lower:
            return 2
        elif 'несколько' in text_lower:
            return 3
        elif 'много' in text_lower or 'толпа' in text_lower:
            return 5
        
        return 0
    
    def _extract_address(self, text: str) -> str:
        """Extract address from text."""
        text_lower = text.lower()
        
        for pattern in self.address_patterns:
            match = re.search(pattern, text_lower, re.IGNORECASE)
            if match:
                try:
                    street = match.group(1).strip()
                    house = match.group(2).strip()
                    return f"ул. {street}, д. {house}"
                except (IndexError, AttributeError):
                    continue
        
        # Try simpler patterns
        simple_patterns = [
            r'на\s+улице\s+([\w\s]+)',
            r'в\s+доме\s+(\d+)',
            r'возле\s+([\w\s]+)'
        ]
        
        for pattern in simple_patterns:
            match = re.search(pattern, text_lower, re.IGNORECASE)
            if match:
                try:
                    location = match.group(1).strip()
                    return f"около {location}"
                except (IndexError, AttributeError):
                    continue
        
        return 'не указан'
    
    def _calculate_confidence(self, result: Dict[str, Any], text: str) -> float:
        """Calculate confidence score for classification (0.0 to 1.0)."""
        confidence = 0.7  # Base confidence
        
        # Increase confidence if address is specific
        address = result.get('address', '')
        if address and address != 'не указан' and 'ул.' in address:
            confidence += 0.1
        
        # Increase confidence if people count is specific
        people = result.get('people_involved', 0)
        if people > 0:
            confidence += 0.05
        
        # Increase confidence if danger/weapons are explicitly mentioned
        if result.get('current_danger', False) or result.get('weapons', False):
            confidence += 0.05
        
        # Decrease confidence if category is 'other'
        if result.get('category') == 'other':
            confidence -= 0.1
        
        # Ensure confidence is within bounds
        return max(0.3, min(1.0, confidence))
    
    def _generate_validation_notes(self, result: Dict[str, Any]) -> List[str]:
        """Generate validation notes for the classification."""
        notes = []
        
        category = result.get('category', 'unknown')
        if category == 'other':
            notes.append("Категория определена как 'other' - требуется ручная проверка")
        
        address = result.get('address', '')
        if address == 'не указан':
            notes.append("Адрес не указан - требуется уточнение")
        
        people = result.get('people_involved', 0)
        if people == 0:
            notes.append("Количество участников не указано")
        
        if result.get('current_danger', False):
            notes.append("Текущая опасность - требуется срочное реагирование")
        
        if result.get('weapons', False):
            notes.append("Наличие оружия - требуется особое внимание")
        
        return notes
    
    def get_category_info(self, category: str) -> Dict[str, Any]:
        """Get information about a specific category."""
        return self.categories.get(category, self.categories['other'])
    
    def list_categories(self) -> List[str]:
        """Get list of all available categories."""
        return list(self.categories.keys())
    
    def validate_json_format(self, data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate that data matches required JSON format."""
        required_fields = [
            'urgency', 'category', 'address', 'current_danger',
            'people_involved', 'weapons', 'recommended_department', 'summary'
        ]
        
        errors = []
        
        # Check required fields
        for field in required_fields:
            if field not in data:
                errors.append(f"Missing required field: {field}")
        
        # Validate urgency
        if 'urgency' in data and data['urgency'] not in ['critical', 'high', 'medium', 'low']:
            errors.append(f"Invalid urgency value: {data['urgency']}")
        
        # Validate category
        if 'category' in data and data['category'] not in self.categories:
            errors.append(f"Unknown category: {data['category']}")
        
        # Validate types
        if 'current_danger' in data and not isinstance(data['current_danger'], bool):
            errors.append("current_danger must be boolean")
        
        if 'weapons' in data and not isinstance(data['weapons'], bool):
            errors.append("weapons must be boolean")
        
        if 'people_involved' in data and not isinstance(data['people_involved'], (int, float)):
            errors.append("people_involved must be number")
        
        return len(errors) == 0, errors


# Factory function for easy instantiation
def create_classifier():
    """Create and return classifier instance."""
    return IncidentClassifier()


# Example usage
if __name__ == "__main__":
    # Test the classifier
    classifier = IncidentClassifier()
    print(f"Available categories: {classifier.list_categories()}")
    
    # Test validation
    test_data = {
        "urgency": "high",
        "category": "assault",
        "address": "ул. Абая, д. 15",
        "current_danger": True,
        "people_involved": 2,
        "weapons": False,
        "recommended_department": "Полиция",
        "summary": "Мужчина избивает женщину во дворе"
    }
    
    is_valid, errors = classifier.validate_json_format(test_data)
    print(f"Validation result: {is_valid}")
    if errors:
        print(f"Errors: {errors}")
    
    # Test classification
    result = classifier.classify(test_data)
    print(f"Enhanced result: {json.dumps(result, indent=2, ensure_ascii=False)}")