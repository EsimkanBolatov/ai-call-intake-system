import logging

logger = logging.getLogger(__name__)


class PriorityDetectorService:
    def __init__(self):
        # Ключевые слова для уточнения приоритета внутри категорий
        self.keywords_high = [
            "убийство", "пожар", "дтп", "кровь", "срочно", "помогите", "спасите",
            "терроризм", "взрыв", "ранен", "заложник", "авария", "нападение",
            "стрельба", "несчастный случай", "избиение"
        ]
        self.keywords_medium = [
            "драка", "угроза", "грабёж", "кража", "шум", "конфликт", "нарушение",
            "подозрение", "пропажа", "потеря", "хулиганство", "вымогательство"
        ]
        self.keywords_low = [
            "консультация", "вопрос", "жалоба", "предложение", "информация",
            "заявление", "обращение", "справка", "уточнение", "разъяснение"
        ]
        logger.info("PriorityDetectorService initialized")

    def determine_priority(self, text: str, category: str) -> str:
        """
        Определяет приоритет (high, medium, low) на основе текста и категории.
        """
        text_lower = text.lower()
        
        # Базовый приоритет по категории
        if category == "срочный":
            base_priority = "high"
        elif category == "нормальный":
            base_priority = "medium"
        else:  # просто
            base_priority = "low"
        
        # Уточнение по ключевым словам
        high_score = sum(1 for kw in self.keywords_high if kw in text_lower)
        medium_score = sum(1 for kw in self.keywords_medium if kw in text_lower)
        low_score = sum(1 for kw in self.keywords_low if kw in text_lower)
        
        # Если есть высокоприоритетные слова, повышаем
        if high_score >= 2:
            return "high"
        elif medium_score >= 2:
            return "medium"
        elif low_score >= 2:
            return "low"
        
        return base_priority