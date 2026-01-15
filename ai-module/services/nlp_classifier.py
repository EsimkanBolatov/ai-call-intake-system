import logging

logger = logging.getLogger(__name__)


class NLPClassifierService:
    def __init__(self):
        # Категории для полицейских обращений
        self.categories = [
            "срочный",
            "нормальный",
            "просто",
        ]
        # Ключевые слова для определения категории
        self.keywords = {
            "срочный": [
                "убийство", "пожар", "дтп", "кровь", "срочно", "помогите", "спасите",
                "терроризм", "взрыв", "ранен", "заложник", "авария", "нападение",
                "грабёж", "кража", "избиение", "стрельба", "несчастный случай"
            ],
            "нормальный": [
                "драка", "угроза", "шум", "конфликт", "нарушение", "жалоба",
                "подозрение", "пропажа", "потеря", "хулиганство", "вымогательство"
            ],
            "просто": [
                "консультация", "вопрос", "информация", "предложение", "заявление",
                "обращение", "справка", "уточнение", "разъяснение"
            ]
        }
        logger.info("NLPClassifierService initialized")

    def classify(self, text: str) -> str:
        """
        Определяет одну категорию звонка: срочный, нормальный, просто.
        Возвращает строку с категорией.
        """
        text_lower = text.lower()
        scores = {cat: 0 for cat in self.categories}
        
        for category, keywords in self.keywords.items():
            for kw in keywords:
                if kw in text_lower:
                    scores[category] += 1
        
        # Если есть ключевые слова из срочного, но их мало, может быть нормальный
        if scores["срочный"] > 0:
            # Дополнительная логика: если есть слова "срочно", "помогите" - срочный
            if any(word in text_lower for word in ["срочно", "помогите", "спасите"]):
                scores["срочный"] += 3
        
        # Определяем категорию с максимальным счетом
        max_score = max(scores.values())
        if max_score == 0:
            return "просто"  # по умолчанию
        
        for category, score in scores.items():
            if score == max_score:
                return category