# Обработка Edge Cases в системе AI-колл-интейк

## 1. Тихий звонящий (No Speech)

### Ситуация

- Звонящий не говорит после приветствия
- Фоновая музыка/шум без речи
- Автоответчик/факс

### Обработка

```python
def handle_no_speech(self, max_silence=5, max_attempts=2):
    """
    Обработка тихого звонящего.

    Алгоритм:
    1. Ждем ответа (max_silence секунд)
    2. Если тишина - проигрываем напоминание
    3. Повторяем max_attempts раз
    4. Если все еще тишина - завершаем с соответствующим статусом
    """
    for attempt in range(max_attempts):
        recording = self.record_response(duration=max_silence)
        if self._has_speech(recording):
            return recording

        # Проигрываем напоминание
        reminder = {
            'ru': "Я вас не слышу. Пожалуйста, расскажите, что произошло.",
            'kk': "Мен сізді естіген жоқпын. Өтінем, не болғанын айтыңыз.",
            'en': "I can't hear you. Please describe what happened."
        }
        self._play_text(reminder[self.language])

    # Все попытки исчерпаны
    self.call_data['status'] = 'no_speech'
    self.call_data['error'] = 'No speech detected'
    return None
```

### Логирование

- Статус: `no_speech`
- Категория: `other`
- Срочность: `low`
- Примечание: "Звонящий не ответил"

## 2. Эмоциональный/агрессивный звонящий

### Ситуация

- Крики, плач, истерика
- Угрозы в адрес системы/операторов
- Ненормативная лексика

### Обработка

```python
def handle_emotional_caller(self, transcript):
    """
    Обработка эмоционального звонящего.

    Алгоритм:
    1. Детектировать эмоциональные маркеры
    2. Успокоить звонящего
    3. Упростить вопросы
    4. При агрессии - эскалация
    """
    # Детекция эмоций
    emotional_score = self._detect_emotion(transcript)
    aggression_score = self._detect_aggression(transcript)

    if aggression_score > 0.7:
        # Серьезная агрессия
        response = {
            'ru': "Пожалуйста, успокойтесь. Я здесь, чтобы помочь.",
            'kk': "Тынышталыңыз. Мен сізге көмектесу үшін мынамын.",
            'en': "Please calm down. I'm here to help."
        }
        self._play_text(response[self.language])

        # Эскалация
        self.call_data['emotional_state'] = 'aggressive'
        self.call_data['needs_human'] = True

    elif emotional_score > 0.5:
        # Эмоциональное состояние
        response = {
            'ru': "Я понимаю, что вы расстроены. Расскажите, что случилось.",
            'kk': "Мен сіздің мазасыз екеніңізді түсінемін. Не болғанын айтыңыз.",
            'en': "I understand you're upset. Please tell me what happened."
        }
        self._play_text(response[self.language])
```

### Логирование

- Поле: `emotional_state` (calm, upset, aggressive)
- Поле: `needs_human` (true/false)
- Примечание: "Требуется человеческое вмешательство"

## 3. Отсутствие адреса

### Ситуация

- Звонящий не знает адрес
- Описание только ориентиров
- "Где-то в центре"

### Обработка

```python
def handle_no_address(self, transcript):
    """
    Обработка отсутствия адреса.

    Алгоритм:
    1. Попытка извлечь из транскрипции
    2. Уточняющие вопросы
    3. Использование геолокации (если доступно)
    4. Привязка к районам/микрорайонам
    """
    address = self._extract_address(transcript)

    if address == 'не указан':
        # Уточняющие вопросы
        questions = {
            'ru': [
                "Какой район города?",
                "Какая улица или ориентир?",
                "Рядом с каким зданием?"
            ],
            'kk': [
                "Қаланың қай ауданы?",
                "Қандай көше немесе бағдар?",
                "Қандай ғимараттың жанында?"
            ]
        }

        for question in questions[self.language]:
            self._play_text(question)
            response = self.record_response(duration=8)
            if response:
                address = self._extract_address(response)
                if address != 'не указан':
                    break

    # Если все еще нет адреса, использовать район
    if address == 'не указан':
        district = self._extract_district(transcript)
        if district:
            address = f"район {district}"

    return address
```

### Логирование

- Адрес: "район [название]" или "не указан"
- Примечание: "Адрес определен приблизительно"

## 4. Неразборчивая речь

### Ситуация

- Сильный акцент/диалект
- Невнятная речь
- Одновременно несколько говорящих

### Обработка

```python
def handle_unclear_speech(self, audio_data, confidence_threshold=0.3):
    """
    Обработка неразборчивой речи.

    Алгоритм:
    1. Проверка confidence STT
    2. Повторная попытка с другими настройками
    3. Упрощенные вопросы да/нет
    4. Переключение на другой язык
    """
    # Первая попытка
    transcript, confidence = self.stt_service.transcribe_with_confidence(audio_data)

    if confidence < confidence_threshold:
        # Вторая попытка с другими параметрами
        transcript, confidence = self.stt_service.transcribe_with_confidence(
            audio_data, language='auto', model='large'
        )

    if confidence < confidence_threshold:
        # Переключение на упрощенные вопросы
        self._play_text("Пожалуйста, отвечайте 'да' или 'нет'.")

        simple_questions = [
            "Есть ли опасность прямо сейчас?",
            "Нужна ли скорая помощь?",
            "Есть ли оружие?"
        ]

        yes_no_responses = []
        for question in simple_questions[:3]:
            self._play_text(question)
            response = self.record_response(duration=3)
            if response:
                yes_no = self._detect_yes_no(response)
                yes_no_responses.append(yes_no)

        # Генерация упрощенного анализа
        return self._generate_simple_analysis(yes_no_responses)

    return transcript
```

### Логирование

- Поле: `speech_quality` (clear, unclear, poor)
- Поле: `stt_confidence` (0.0-1.0)
- Примечание: "Речь неразборчива, использованы упрощенные вопросы"

## 5. Множественные инциденты в одном звонке

### Ситуация

- Звонящий сообщает о нескольких проблемах
- "И тут кража, и там драка"
- Смешанные категории

### Обработка

```python
def handle_multiple_incidents(self, transcript):
    """
    Обработка множественных инцидентов.

    Алгоритм:
    1. Сегментация текста по инцидентам
    2. Отдельный анализ каждого
    3. Определение приоритета
    4. Консолидация результатов
    """
    # Сегментация
    segments = self._segment_incidents(transcript)

    if len(segments) <= 1:
        return self.analyze_with_ai(transcript)

    # Анализ каждого сегмента
    incidents = []
    for segment in segments:
        analysis = self.analyze_with_ai(segment)
        incidents.append(analysis)

    # Определение главного инцидента
    main_incident = self._determine_main_incident(incidents)

    # Консолидация
    consolidated = {
        'urgency': main_incident['urgency'],
        'category': 'multiple',
        'address': self._consolidate_addresses(incidents),
        'current_danger': any(i['current_danger'] for i in incidents),
        'people_involved': sum(i['people_involved'] for i in incidents),
        'weapons': any(i['weapons'] for i in incidents),
        'recommended_department': self._determine_department(incidents),
        'summary': f"Множественные инциденты: {', '.join(i['category'] for i in incidents)}",
        'multiple_incidents': True,
        'incident_count': len(segments),
        'incidents': incidents
    }

    return consolidated
```

### Логирование

- Категория: `multiple`
- Поле: `incident_count` (количество инцидентов)
- Поле: `incidents` (массив анализов)
- Примечание: "Обнаружены множественные инциденты"

## 6. Тестовые/ложные вызовы

### Ситуация

- Дети играют с телефоном
- Намеренные ложные вызовы
- Проверка системы

### Обработка

```python
def handle_test_call(self, transcript, caller_id):
    """
    Обнаружение тестовых/ложных вызовов.

    Алгоритм:
    1. Анализ содержания
    2. Проверка истории звонящего
    3. Детекция ключевых фраз
    4. Ограничение частоты вызовов
    """
    # Ключевые фразы для тестовых вызовов
    test_phrases = [
        'тест', 'проверка', 'работает', 'привет', 'алло',
        'test', 'check', 'hello', 'hi', 'работаешь'
    ]

    transcript_lower = transcript.lower()
    test_score = sum(1 for phrase in test_phrases if phrase in transcript_lower)

    # Проверка истории звонящего
    call_history = self.logger_service.get_caller_history(caller_id)
    if call_history and len(call_history) > 3:
        # Частый звонящий
        recent_calls = [c for c in call_history if c['status'] == 'test']
        if len(recent_calls) > 2:
            return True

    # Определение по содержанию
    if test_score >= 2 or len(transcript.strip()) < 10:
        return True

    return False
```

### Логирование

- Статус: `test` или `false_alarm`
- Примечание: "Возможный тестовый/ложный вызов"
- Действие: Запись в черный список при повторениях

## 7. Языковые проблемы

### Ситуация

- Звонящий говорит на неподдерживаемом языке
- Смешение языков
- Язык не определяется

### Обработка

```python
def handle_language_issues(self, audio_data):
    """
    Обработка языковых проблем.

    Алгоритм:
    1. Детекция языка
    2. Попытка переключения
    3. Использование языка по умолчанию
    4. Информирование звонящего
    """
    # Детекция языка
    detected_lang = self.stt_service.detect_language(audio_data)

    if detected_lang not in ['ru', 'kk', 'en']:
        # Неподдерживаемый язык
        message = {
            'ru': "Извините, я понимаю только русский и казахский. Пожалуйста, говорите на одном из этих языков.",
            'kk': "Кешіріңіз, мен тек орыс және қазақ тілдерін түсінемін. Өтінем, осы тілдердің бірінде сөйлеңіз.",
            'en': "Sorry, I only understand Russian and Kazakh. Please speak one of these languages."
        }

        # Попробовать на всех поддерживаемых языках
        for lang in ['ru', 'kk', 'en']:
            self.language = lang
            self._play_text(message[lang])
            response = self.record_response(duration=10)
            if response:
                new_lang = self.stt_service.detect_language(response)
                if new_lang in ['ru', 'kk', 'en']:
                    self.language = new_lang
                    return response

        # Не удалось определить язык
        self.call_data['status'] = 'language_not_supported'
        return None

    # Язык поддерживается
    self.language = detected_lang
    return self.stt_service.transcribe(audio_data, detected_lang)
```

### Логирование

- Поле: `detected_language` (код языка)
- Поле: `final_language` (использованный язык)
- Статус: `language_not_supported` (если язык не поддерживается)

## 8. Технические проблемы

### Ситуация

- Плохое качество связи
- Обрыв звонка
- Проблемы с аудио

### Обработка

```python
def handle_technical_issues(self, error):
    """
    Обработка технических проблем.

    Алгоритм:
    1. Классификация ошибки
    2. Попытка восстановления
    3. Информирование звонящего
    4. Аварийное завершение
    """
    error_type = self._classify_error(error)

    recovery_attempts = {
        'audio_quality': 2,
        'network_issue': 1,
        'system_error': 0
    }

    attempts = recovery_attempts.get(error_type, 0)

    for attempt in range(attempts):
        try:
            # Попытка восстановления
            if error_type == 'audio_quality':
                self._adjust_audio_settings()
            elif error_type == 'network_issue':
                self._reestablish_connection()

            # Продолжение обработки
            return self._continue_call_processing()

        except Exception as retry_error:
            logger.error(f"Recovery attempt {attempt + 1} failed: {retry_error}")

    # Все попытки исчерпаны
    error_message = {
        'ru': "Извините, возникли технические проблемы. Пожалуйста, перезвоните.",
        'kk': "Кешіріңіз, техникалық қиындықтар туындады. Өтінем, қайта қоңырау шалыңыз.",
        'en': "Sorry, technical issues occurred. Please call again."
    }

    self._play_text(error_message[self.language])
    self.call_data['status'] = f'technical_error_{error_type}'
    self.call_data['error'] = str(error)
```

### Логирование

- Статус: `technical_error_[type]`
- Поле: `error_details` (детали ошибки)
- Примечание: "Техническая ошибка, требующая вмешательства"

## 9. Конфиденциальная информация

### Ситуация

- Звонящий сообщает личные данные
- Номера документов, телефонов
- Конфиденциальная информация

### Обработка

```python
def handle_sensitive_info(self, transcript):
    """
    Обработка конфиденциальной информации.

    Алгоритм:
    1. Детекция чувствительных данных
    2. Маскирование в логах
    3. Информирование звонящего
    4. Безопасное хранение (если необходимо)
    """
    # Регулярные выражения для чувствительных данных
    patterns = {
        'iin': r'\b\d{12}\b',  # ИИН Казахстан
        'phone': r'\b\+7\d{10}\b|\b8\d{10}\b',
        'card': r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b',
        'passport': r'\b(?:[A-Z]{2}\d{7}|№\s*\d{6})\b'
    }

    masked_transcript = transcript
    detected_sensitive = []

    for data_type, pattern in patterns.items():
        matches = re.findall(pattern, transcript)
        if matches:
            detected_sensitive.append
```
