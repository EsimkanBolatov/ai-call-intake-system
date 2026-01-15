# Руководство по установке и тестированию AI Call Intake System

## 1. Требования к системе

### Минимальные требования

- **ОС**: Ubuntu 20.04/22.04 LTS или Windows Server 2019+
- **Память**: 4 ГБ ОЗУ (8+ ГБ рекомендуется)
- **Хранилище**: 20 ГБ свободного места
- **Процессор**: 4+ ядер (x86_64)
- **Сеть**: Статический IP, порты 5060 (SIP), 80/443 (HTTP)

### Рекомендуемые требования

- **ОС**: Ubuntu 22.04 LTS
- **Память**: 16 ГБ ОЗУ (для Whisper + Coqui TTS)
- **Хранилище**: 100 ГБ SSD
- **GPU**: NVIDIA GPU с 4+ ГБ VRAM (для ускорения AI)
- **Сеть**: 100 Мбит/с канал

## 2. Установка Asterisk

### Ubuntu/Debian

```bash
# Обновление системы
sudo apt update
sudo apt upgrade -y

# Установка зависимостей
sudo apt install -y build-essential wget libssl-dev libncurses5-dev \
  libnewt-dev libxml2-dev libsqlite3-dev libjansson-dev \
  uuid-dev libsrtp2-dev libedit-dev

# Скачивание и установка Asterisk 18
cd /usr/src
sudo wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-18-current.tar.gz
sudo tar -xvf asterisk-18-current.tar.gz
cd asterisk-18*/

# Конфигурация и компиляция
sudo ./configure
sudo make -j4
sudo make install
sudo make samples
sudo make config
sudo ldconfig

# Создание пользователя asterisk
sudo groupadd asterisk
sudo useradd -r -d /var/lib/asterisk -g asterisk asterisk
sudo chown -R asterisk:asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk

# Копирование конфигураций из проекта
sudo cp /path/to/ai-call-intake-system/asterisk/config/* /etc/asterisk/
sudo chown asterisk:asterisk /etc/asterisk/*.conf
```

### Настройка SIP trunk

Отредактируйте `/etc/asterisk/sip.conf`:

```ini
[provider-trunk]
type=peer
host=sip.your-provider.com
defaultuser=your_username
secret=your_password
context=incoming
```

### Запуск Asterisk

```bash
# Запуск как службы
sudo systemctl enable asterisk
sudo systemctl start asterisk

# Проверка статуса
sudo systemctl status asterisk
sudo asterisk -rvvv
```

## 3. Установка Python окружения

### Установка Python 3.10+

```bash
# Ubuntu
sudo apt install -y python3.10 python3.10-venv python3.10-dev

# Создание виртуального окружения
cd /opt/ai-call-intake
python3.10 -m venv venv
source venv/bin/activate
```

### Установка зависимостей

```bash
# Основные зависимости
pip install --upgrade pip
pip install fastapi uvicorn sqlalchemy pydantic

# AI зависимости
pip install openai-whisper  # STT
pip install openai          # LLM (или pip install deepseek-api)
pip install TTS             # Coqui TTS

# Дополнительные зависимости
pip install asterisk-agi python-dotenv requests
```

### Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# API ключи
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Конфигурация сервисов
STT_ENGINE=whisper          # whisper, google, azure, mock
LLM_ENGINE=openai           # openai, deepseek, ollama, mock
TTS_ENGINE=coqui            # coqui, openai, google, mock

# Пути
CALL_LOG_DB=/var/lib/ai-call-intake/calls.db
RECORDINGS_DIR=/var/spool/asterisk/monitor
TTS_OUTPUT_DIR=/tmp/tts_output

# Настройки безопасности
RATE_LIMIT_PER_HOUR=5
MAX_CALL_DURATION=300
```

## 4. Настройка AGI скрипта

### Копирование AGI скрипта

```bash
sudo cp agi/call_handler.py /var/lib/asterisk/agi-bin/
sudo chmod +x /var/lib/asterisk/agi-bin/call_handler.py
sudo chown asterisk:asterisk /var/lib/asterisk/agi-bin/call_handler.py
```

### Настройка прав

```bash
# Создание необходимых директорий
sudo mkdir -p /var/lib/ai-call-intake /var/log/ai-call-intake
sudo chown -R asterisk:asterisk /var/lib/ai-call-intake /var/log/ai-call-intake

# Настройка Python пути для Asterisk
sudo mkdir -p /usr/local/lib/python3.10/dist-packages/
sudo cp -r services /usr/local/lib/python3.10/dist-packages/
```

## 5. Запуск системы

### Запуск Asterisk

```bash
sudo systemctl restart asterisk
```

### Проверка AGI интеграции

```bash
# В консоли Asterisk
sudo asterisk -rvvv
agi show status
```

### Запуск Dashboard (опционально)

```bash
cd dashboard
pip install -r requirements.txt
python app.py
# Dashboard будет доступен по http://localhost:5000
```

## 6. Тестирование системы

### Тест 1: Внутренний тестовый звонок

```bash
# В консоли Asterisk
channel originate SIP/500 extension 500@internal-test
```

### Тест 2: Эмуляция звонка через Python

```python
# test_call_emulation.py
import subprocess
import time

# Эмуляция входящего звонка
def test_call_emulation():
    print("Starting call emulation...")

    # Использование Asterisk CLI для инициирования тестового звонка
    cmd = [
        'asterisk', '-rx',
        'channel originate SIP/testcall extension 500@internal-test'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"Call initiated: {result.stdout}")

    # Ждем обработки
    time.sleep(10)

    # Проверка логов
    with open('/var/log/asterisk/full', 'r') as f:
        logs = f.read()
        if 'AGI Script call_handler.py' in logs:
            print("✓ AGI script executed successfully")
        else:
            print("✗ AGI script not found in logs")

if __name__ == '__main__':
    test_call_emulation()
```

### Тест 3: Проверка STT

```python
# test_stt.py
from services.stt_service import STTService

def test_stt():
    service = STTService(engine="mock")

    # Тестовый аудио (можно использовать реальный WAV файл)
    test_audio = b"fake audio data"

    result = service.transcribe(test_audio, "ru")
    print(f"STT Result: {result}")

    info = service.get_engine_info()
    print(f"Engine Info: {info}")

test_stt()
```

### Тест 4: Проверка LLM

```python
# test_llm.py
from services.llm_service import LLMService

def test_llm():
    service = LLMService(engine="mock")

    test_transcript = "Мужчина кричит на женщину во дворе дома номер 15"

    result = service.analyze_incident(test_transcript, "ru")
    print(f"LLM Analysis: {result}")

    # Проверка JSON формата
    import json
    print(f"JSON Valid: {json.dumps(result, ensure_ascii=False)}")

test_llm()
```

### Тест 5: Полный цикл обработки

```python
# test_full_cycle.py
from agi.call_handler import CallHandler

def test_full_cycle():
    # Создание обработчика в тестовом режиме
    handler = CallHandler(agi=None)

    # Эмуляция звонка
    handler.handle_call("+77771234567", "ru")

    # Проверка результатов
    print(f"Call Data: {handler.call_data}")

    # Проверка записи в БД
    from services.logger import CallLogger
    logger = CallLogger()
    recent_calls = logger.get_recent_calls(limit=1)
    print(f"Recent Calls: {recent_calls}")

test_full_cycle()
```

## 7. Интеграционное тестирование

### Тест с реальным SIP телефоном

1. Настройте SIP телефон с учетными данными из `sip.conf`
2. Позвоните на номер, настроенный в `extensions.conf`
3. Проверьте:
   - Автоответ системы
   - Качество записи
   - Скорость обработки
   - Корректность классификации

### Нагрузочное тестирование

```bash
# Установка siege для нагрузочного тестирования
sudo apt install siege

# Тестирование API endpoints
siege -c 10 -t 30S "http://localhost:5000/api/calls"
```

## 8. Мониторинг и отладка

### Ключевые логи

```bash
# Логи Asterisk
tail -f /var/log/asterisk/full
tail -f /var/log/asterisk/agi

# Логи приложения
tail -f /var/log/ai-call-intake/agi.log
tail -f /var/log/ai-call-intake/calls_fallback.log

# Логи базы данных
sqlite3 /var/lib/ai-call-intake/calls.db "SELECT * FROM calls ORDER BY timestamp DESC LIMIT 5;"
```

### Проверка здоровья системы

```bash
# Health check API
curl http://localhost:5000/api/health

# Проверка Asterisk
sudo asterisk -rx "core show channels"
sudo asterisk -rx "sip show peers"
```

## 9. Устранение неполадок

### Проблема: AGI скрипт не выполняется

**Решение:**

```bash
# Проверка прав
ls -la /var/lib/asterisk/agi-bin/call_handler.py

# Проверка логов AGI
tail -f /var/log/asterisk/agi

# Тест AGI вручную
sudo -u asterisk /var/lib/asterisk/agi-bin/call_handler.py TEST 123456 ru
```

### Проблема: Нет аудио

**Решение:**

```bash
# Проверка кодеков
sudo asterisk -rx "core show translation"

# Проверка RTP
sudo asterisk -rx "rtp show stats"

# Проверка firewall
sudo ufw status
sudo ufw allow 5060/udp
sudo ufw allow 10000:20000/udp
```

### Проблема: Ошибки Python

**Решение:**

```bash
# Проверка версии Python
python3 --version

# Проверка зависимостей
pip list | grep -E "(whisper|openai|TTS)"

# Проверка путей Python для Asterisk
sudo -u asterisk python3 -c "import sys; print(sys.path)"
```

## 10. Производительность и оптимизация

### Оптимизация Whisper

```python
# В stt_service.py
WHISPER_CONFIG = {
    'model_size': 'base',  # tiny, base, small, medium, large
    'language': 'ru',
    'fp16': False,  # Использовать FP32 для совместимости
    'temperature': 0.0,
    'best_of': 1
}
```

### Кэширование TTS

```python
# Кэширование сгенерированной речи
TTS_CACHE = {
    'enabled': True,
    'max_size': 1000,  # кэшированных фраз
    'ttl': 3600  # время жизни в секундах
}
```

### Мониторинг производительности

```bash
# Мониторинг ресурсов
htop
nvidia-smi  # если есть GPU

# Мониторинг сети
iftop
netstat -tulpn | grep -E "(5060|5000)"
```

## 11. Резервное копирование и восстановление

### Ежедневное резервное копирование

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/ai-call-intake"
DATE=$(date +%Y%m%d_%H%M%S)

# Резервное копирование базы данных
sqlite3 /var/lib/ai-call-intake/calls.db ".backup $BACKUP_DIR/calls_$DATE.db"

# Резервное копирование конфигураций
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /etc/asterisk/*.conf

# Резервное копирование логов (опционально)
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /var/log/ai-call-intake/*.log

# Удаление старых резервных копий (старше 30 дней)
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### Восстановление из резервной копии

```bash
# Восстановление базы данных
sqlite3 /var/lib/ai-call-intake/calls.db ".restore /backups/ai-call-intake/calls_20251230_120000.db"

# Восстановление конфигураций
tar -xzf /backups/ai-call-intake/config_20251230_120000.tar.gz -C /
sudo systemctl restart asterisk
```

## 12. Дальнейшие шаги

### Производственная настройка

1. Настройка SSL/TLS для SIP и HTTPS
2. Настройка мониторинга (Prometheus + Grafana)
3. Настройка алертинга (Telegram/Email уведомления)
4. Настройка балансировщика нагрузки для горизонтального масштабирования

### Расширение функциональности

1. Интеграция с CRM системами
2. Добавление поддержки видео-звонков
3. Интеграция с геолокацией
4. Добавление мультиязычной поддержки

### Обучение и документация

1. Создание руководства для операторов
2. Обучение персонала работе с системой
3. Создание API документации для интеграций
4. Разработка тестовых сценариев для QA
