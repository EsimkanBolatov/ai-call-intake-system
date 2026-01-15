# Руководство по тестированию AI Call Intake System

## 1. Обзор тестирования

### Цели тестирования

1. **Функциональность**: Проверка корректности обработки звонков
2. **Производительность**: Оценка времени отклика и ресурсов
3. **Надежность**: Проверка отказоустойчивости и восстановления
4. **Безопасность**: Проверка защиты от злоупотреблений
5. **Интеграция**: Проверка взаимодействия компонентов

### Типы тестов

- **Модульные тесты**: Отдельные компоненты (STT, LLM, TTS)
- **Интеграционные тесты**: Взаимодействие компонентов
- **Системные тесты**: Полный цикл обработки звонка
- **Нагрузочные тесты**: Множественные одновременные звонки
- **Тесты безопасности**: Проверка уязвимостей

## 2. Тестовые сценарии

### Сценарий 1: Стандартный инцидент (Урлық)

**Описание**: Звонок о краже телефона
**Ожидаемый результат**: Классификация как "theft", urgency "medium"

```python
# test_scenario_theft.py
def test_theft_scenario():
    transcript = "Менің телефоным ұрланды. Мен дүкеннің алдында тұрдым, біреу жүгіріп келіп алды."

    expected_result = {
        "urgency": "medium",
        "category": "theft",
        "address": "дүкеннің алдында",
        "current_danger": False,
        "people_involved": 1,
        "weapons": False,
        "recommended_department": "ұрлық бөлімі",
        "summary": "Телефон ұрланды, қауіп жоқ"
    }

    # Выполнение теста
    result = process_transcript(transcript)
    assert result["category"] == "theft"
    assert result["urgency"] == "medium"
```

### Сценарий 2: Критический инцидент (Шабуыл)

**Описание**: Нападение с ножом
**Ожидаемый результат**: Классификация как "assault", urgency "critical"

```python
def test_assault_scenario():
    transcript = "Біреу пышақпен шабуыл жасады! Ол әлі де осында, мен қорқамын!"

    expected_result = {
        "urgency": "critical",
        "category": "assault",
        "address": "",  # адрес не указан
        "current_danger": True,
        "people_involved": 2,
        "weapons": True,
        "recommended_department": "жедел бөлім",
        "summary": "Пышақпен шабуыл, қауіп бар"
    }
```

### Сценарий 3: Бытовой конфликт (ЖКО)

**Описание**: Семейная ссора
**Ожидаемый результат**: Классификация как "domestic", urgency "high"

```python
def test_domestic_scenario():
    transcript = "Көршілер айқайласып жатыр, әйел баласымен қорқып жатыр."

    expected_result = {
        "urgency": "high",
        "category": "domestic",
        "address": "көрші үй",
        "current_danger": True,
        "people_involved": 3,
        "weapons": False,
        "recommended_department": "отбасылық қатынастар бөлімі",
        "summary": "Отбасылық дау, бала бар"
    }
```

### Сценарий 4: ДТП

**Описание**: Дорожно-транспортное происшествие
**Ожидаемый результат**: Классификация как "traffic_accident", urgency "high"

```python
def test_traffic_scenario():
    transcript = "Көлік апаты болды. Екі машина соғылып қалды, біреу жарақат алды."

    expected_result = {
        "urgency": "high",
        "category": "traffic_accident",
        "address": "",  # адрес не указан
        "current_danger": False,
        "people_involved": 2,
        "weapons": False,
        "recommended_department": "жол полициясы",
        "summary": "Көлік апаты, жарақат бар"
    }
```

## 3. Тестовые аудио файлы

### Создание тестовых аудио

```bash
# Установка утилит для генерации аудио
sudo apt install -y sox ffmpeg

# Генерация тестового аудио (русский язык)
sox -n -r 8000 -c 1 test_audio_1.wav synth 5 sine 440
echo "Менің телефоным ұрланды" | text2wave -o test_audio_2.wav

# Генерация аудио с эмоциями (крики)
sox -n -r 8000 -c 1 test_audio_3.wav synth 3 sine 660 vol 1.5
```

### Тестовые аудио файлы

1. **normal_speech.wav** - Нормальная речь, четкая дикция
2. **emotional_speech.wav** - Эмоциональная речь с паузами
3. **background_noise.wav** - Речь с фоновым шумом
4. **silent_audio.wav** - Тишина (10 секунд)
5. **unclear_speech.wav** - Неразборчивая речь

## 4. Автоматизированные тесты

### Модульные тесты

```python
# tests/test_stt.py
import unittest
from services.stt_service import STTService

class TestSTTService(unittest.TestCase):
    def setUp(self):
        self.service = STTService(engine="mock")

    def test_transcribe_english(self):
        result = self.service.transcribe(b"test audio", "en")
        self.assertIn("text", result)

    def test_transcribe_russian(self):
        result = self.service.transcribe(b"тестовое аудио", "ru")
        self.assertEqual(result["language"], "ru")

    def test_empty_audio(self):
        result = self.service.transcribe(b"", "en")
        self.assertEqual(result["text"], "")
```

### Интеграционные тесты

```python
# tests/test_integration.py
import unittest
from agi.call_handler import CallHandler
from unittest.mock import Mock

class TestCallIntegration(unittest.TestCase):
    def test_full_call_processing(self):
        # Мок AGI объекта
        mock_agi = Mock()
        mock_agi.get_variable.return_value = "+77771234567"

        handler = CallHandler(mock_agi)
        result = handler.handle_call("+77771234567", "ru")

        # Проверка структуры результата
        self.assertIn("call_id", result)
        self.assertIn("transcript", result)
        self.assertIn("ai_analysis", result)

        # Проверка JSON формата
        ai_result = result["ai_analysis"]
        required_fields = ["urgency", "category", "address", "current_danger"]
        for field in required_fields:
            self.assertIn(field, ai_result)
```

### Тесты производительности

```python
# tests/test_performance.py
import time
import statistics
from services.llm_service import LLMService

class TestPerformance(unittest.TestCase):
    def test_llm_response_time(self):
        service = LLMService(engine="mock")
        transcripts = [
            "Кішкентай тест",
            "Орташа ұзындықтағы транскрипт бұл жерде",
            "Өте ұзын транскрипт " * 10
        ]

        times = []
        for transcript in transcripts:
            start = time.time()
            service.analyze_incident(transcript, "ru")
            end = time.time()
            times.append(end - start)

        avg_time = statistics.mean(times)
        print(f"Average LLM response time: {avg_time:.2f}s")
        self.assertLess(avg_time, 5.0)  # Менее 5 секунд
```

## 5. Ручное тестирование

### Тест 1: Телефонный звонок

**Шаги:**

1. Настройте SIP телефон или софтфон (MicroSIP, Zoiper)
2. Зарегистрируйтесь с учетными данными из `sip.conf`
3. Позвоните на номер 500 (тестовый extension)
4. Проверьте:
   - Автоответ системы (должен быть через 2-3 секунды)
   - Качество звука (без эха, четкая речь)
   - Время обработки (менее 10 секунд на реплику)
   - Корректность диалога

**Ожидаемый диалог:**

```
Система: "102 қызметінің автоматты көмекшісісіз. Қысқаша не болғанын айтыңыз."
Вы: "Менің машинам ұрланды."
Система: "Қай жерде болды?"
Вы: "Аулада, үй алдында."
Система: "Қазір қауіп бар ма?"
Вы: "Жоқ, ешкім жоқ."
Система: "Түсінікті. Деректеріңізді қабылдадық. Көмек жолдалады."
```

### Тест 2: Проверка записи

**Шаги:**

1. Совершите тестовый звонок
2. Проверьте наличие записи:

```bash
ls -la /var/spool/asterisk/monitor/
# Должен быть файл типа 20251230-120000-77771234567.wav
```

3. Проверьте качество записи:

```bash
soxi /var/spool/asterisk/monitor/20251230-120000-77771234567.wav
# Должны быть: Duration 00:00:30, Sample Rate 8000 Hz
```

### Тест 3: Проверка логов

**Шаги:**

1. Совершите звонок
2. Проверьте логи Asterisk:

```bash
tail -f /var/log/asterisk/full | grep -E "(AGI|call_handler)"
```

3. Проверьте логи приложения:

```bash
tail -f /var/log/ai-call-intake/agi.log
```

4. Проверьте запись в БД:

```bash
sqlite3 /var/lib/ai-call-intake/calls.db \
  "SELECT call_id, caller_number, urgency, category FROM calls ORDER BY timestamp DESC LIMIT 1;"
```

## 6. Нагрузочное тестирование

### Тест множественных звонков

```python
# stress_test.py
import concurrent.futures
import time
import random
from asterisk.manager import Manager

def make_test_call(call_id):
    """Имитация звонка через Asterisk Manager Interface"""
    manager = Manager()
    manager.connect('localhost')
    manager.login('admin', 'password')

    # Генерация случайного номера
    caller_id = f"+7777{random.randint(1000000, 9999999)}"

    # Инициирование звонка
    response = manager.originate(
        f"Local/500@internal-test",
        context='internal-test',
        extension='500',
        priority=1,
        callerid=caller_id,
        timeout=30000
    )

    time.sleep(random.uniform(5, 15))  # Имитация разговора

    manager.logoff()
    return f"Call {call_id}: {caller_id} - {response}"

def run_stress_test(num_calls=10):
    """Запуск множественных одновременных звонков"""
    print(f"Starting stress test with {num_calls} concurrent calls...")

    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(make_test_call, i) for i in range(num_calls)]

        for future in concurrent.futures.as_completed(futures):
            try:
                result = future.result()
                print(result)
            except Exception as e:
                print(f"Call failed: {e}")

    end_time = time.time()
    print(f"Stress test completed in {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    run_stress_test(5)  # 5 одновременных звонков
```

### Мониторинг ресурсов во время нагрузочного тестирования

```bash
# Мониторинг CPU и памяти
top -b -d 1 -n 60 > cpu_memory.log &

# Мониторинг сети
iftop -t -s 60 > network_traffic.log &

# Мониторинг диска
iostat -x 1 60 > disk_io.log &

# Запуск нагрузочного теста
python stress_test.py

# Анализ результатов
echo "=== CPU Usage ==="
grep "%Cpu" cpu_memory.log | tail -5
echo "=== Memory Usage ==="
grep "MiB Mem" cpu_memory.log | tail -5
```

## 7. Тестирование edge cases

### Тест 1: Тихий звонящий

**Сценарий**: Звонящий не говорит в течение 10 секунд
**Ожидаемое поведение**: Система задает уточняющий вопрос, затем завершает звонок

```python
def test_silent_caller():
    # Эмуляция тишины
    audio_data = b"\x00" * 80000  # 10 секунд тишины (8000 Гц)

    result = stt_service.transcribe(audio_data, "ru")
    assert result["text"] == ""
    assert result["confidence"] < 0.1

    # Проверка обработки в call_handler
    handler = CallHandler(mock_agi)
    result = handler.handle_silence(10)
    assert result["action"] == "ask_followup"
    assert "Сіз бен байланыс жоқ" in result["response"]
```

### Тест 2: Эмоциональный/агрессивный звонящий

**Сценарий**: Звонящий кричит, использует ненормативную лексику
**Ожидаемое поведение**: Система сохраняет спокойствие, продолжает сбор информации

```python
def test_emotional_caller():
    transcript = "СЕНІҢ АНАҢЫҢДЫ! МЕНЕДЕН ҚҰТЫЛЫҢЫЗ! БАРЛЫҒЫҢЫЗДЫ ӨЛТІРЕМІН!"

    result = llm_service.analyze_incident(transcript, "ru")

    # Проверка что система не отвечает агрессией
    assert "aggressive" not in result["summary"].lower()
    assert result["urgency"] == "critical"  # Должен определить как критический
```

### Тест 3: Неразборчивая речь

**Сценарий**: Звонящий говорит невнятно или на смеси языков
**Ожидаемое поведение**: Система просит повторить, максимум 3 попытки

```python
def test_unclear_speech():
    transcript = "мргх блргх кшпт влдмн 123"

    result = classifier.classify(transcript)

    # Должен вернуть low confidence
    assert result["confidence"] < 0.3
    assert result["action"] == "ask_for_clarification"
```

### Тест 4: Длинный монолог

**Сценарий**: Звонящий говорит более 2 минут без пауз
**Ожидаемое поведение**: Система вежливо прерывает и просит кратко описать

```python
def test_long_monologue():
    # Генерация длинного текста
    long_text = "Бұл өте ұзын әңгіме " * 100

    result = llm_service.analyze_incident(long_text[:1000], "ru")  # Обрезать до 1000 символов

    # Проверка что система обработала только релевантную часть
    assert len(result["summary"]) < 500
```

## 8. Тестирование безопасности

### Тест 1: Rate limiting

```python
def test_rate_limiting():
    """Проверка ограничения количества звонков"""
    from services.security import RateLimiter

    limiter = RateLimiter(limit_per_hour=5)

    # 6 звонков с одного номера
    for i in range(6):
        allowed = limiter.check_limit("+77771111111")
        if i < 5:
            assert allowed
```
