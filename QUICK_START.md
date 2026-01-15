# Быстрый старт: AI Call Intake System

## 1. Минимальные требования

- Ubuntu 20.04/22.04 или Windows 10/11 с WSL2
- 4 ГБ ОЗУ, 20 ГБ свободного места
- Python 3.10+, Asterisk 18+

## 2. Быстрая установка (Ubuntu)

### Шаг 1: Установка Asterisk

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка зависимостей
sudo apt install -y asterisk python3.10 python3.10-venv git

# Проверка установки
asterisk -V
```

### Шаг 2: Клонирование проекта

```bash
git clone <ваш-репозиторий>
cd ai-call-intake-system
```

### Шаг 3: Настройка Python окружения

```bash
# Создание виртуального окружения
python3.10 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install --upgrade pip
pip install fastapi uvicorn openai-whisper openai TTS asterisk-agi
```

### Шаг 4: Копирование конфигураций Asterisk

```bash
sudo cp asterisk/config/* /etc/asterisk/
sudo systemctl restart asterisk
```

### Шаг 5: Настройка AGI скрипта

```bash
sudo cp agi/call_handler.py /var/lib/asterisk/agi-bin/
sudo chmod +x /var/lib/asterisk/agi-bin/call_handler.py
sudo chown asterisk:asterisk /var/lib/asterisk/agi-bin/call_handler.py
```

### Шаг 6: Создание .env файла

```bash
cat > .env << EOF
# Режим работы (mock для тестирования без API ключей)
STT_ENGINE=mock
LLM_ENGINE=mock
TTS_ENGINE=mock

# Пути
CALL_LOG_DB=/tmp/calls.db
RECORDINGS_DIR=/tmp/recordings
TTS_OUTPUT_DIR=/tmp/tts

# Безопасность
RATE_LIMIT_PER_HOUR=10
MAX_CALL_DURATION=300
EOF
```

## 3. Запуск системы

### Запуск Asterisk

```bash
sudo systemctl start asterisk
sudo systemctl enable asterisk
```

### Проверка работы Asterisk

```bash
sudo asterisk -rvvv
# В консоли Asterisk выполните:
# sip show peers
# agi show status
```

### Запуск Dashboard (опционально)

```bash
cd dashboard
pip install -r requirements.txt
python app.py
# Откройте http://localhost:5000 в браузере
```

## 4. Тестовый звонок

### Способ 1: Через консоль Asterisk

```bash
sudo asterisk -rvvv
# В консоли выполните:
channel originate SIP/500 extension 500@internal-test
```

### Способ 2: Через Python скрипт

Создайте файл `test_call.py`:

```python
import subprocess
import time

def test_call():
    print("Инициирование тестового звонка...")

    # Команда для инициирования звонка через Asterisk CLI
    cmd = [
        'asterisk', '-rx',
        'channel originate SIP/testcall extension 500@internal-test'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"Результат: {result.stdout}")

    # Ждем обработки
    time.sleep(15)

    # Проверка логов
    print("Проверка логов...")
    with open('/var/log/asterisk/full', 'r') as f:
        logs = f.read()
        if 'AGI Script' in logs:
            print("✅ AGI скрипт выполнен успешно")
        else:
            print("❌ AGI скрипт не найден в логах")

if __name__ == '__main__':
    test_call()
```

Запустите:

```bash
python test_call.py
```

### Способ 3: Использование SIP телефона

1. Установите SIP софтфон (MicroSIP, Zoiper)
2. Настройте с параметрами:
   - Сервер: localhost или IP вашего сервера
   - Порт: 5060
   - Логин: 500
   - Пароль: 500
3. Позвоните на номер 500

## 5. Проверка работы

### Проверка логов

```bash
# Логи Asterisk
tail -f /var/log/asterisk/full | grep -E "(AGI|call_handler)"

# Логи приложения
tail -f /var/log/asterisk/agi

# Проверка базы данных
sqlite3 /tmp/calls.db "SELECT * FROM calls ORDER BY timestamp DESC LIMIT 1;"
```

### Проверка записей

```bash
ls -la /tmp/recordings/
# Должны появиться WAV файлы
```

## 6. Переход на реальные AI сервисы

### Настройка OpenAI API

```bash
# Редактируйте .env файл
cat > .env << EOF
STT_ENGINE=whisper
LLM_ENGINE=openai
TTS_ENGINE=openai

OPENAI_API_KEY=sk-ваш-ключ-здесь

# Остальные настройки...
EOF
```

### Настройка DeepSeek API

```bash
cat > .env << EOF
STT_ENGINE=whisper
LLM_ENGINE=deepseek
TTS_ENGINE=coqui

DEEPSEEK_API_KEY=sk-ваш-ключ-здесь

# Для Coqui TTS установите дополнительные зависимости
pip install TTS
EOF
```

## 7. Устранение неполадок

### Проблема: Asterisk не запускается

```bash
# Проверка статуса
sudo systemctl status asterisk

# Просмотр логов
sudo journalctl -u asterisk -f

# Проверка конфигурации
sudo asterisk -rx "core show channels"
```

### Проблема: AGI скрипт не выполняется

```bash
# Проверка прав
ls -la /var/lib/asterisk/agi-bin/call_handler.py

# Тест AGI вручную
sudo -u asterisk /var/lib/asterisk/agi-bin/call_handler.py TEST 123456 ru

# Проверка Python пути
sudo -u asterisk python3 -c "import sys; print(sys.path)"
```

### Проблема: Нет звука

```bash
# Проверка кодеков
sudo asterisk -rx "core show translation"

# Проверка RTP
sudo asterisk -rx "rtp show stats"

# Проверка firewall
sudo ufw allow 5060/udp
sudo ufw allow 10000:20000/udp
```

## 8. Быстрые команды для разработки

### Перезапуск системы

```bash
#!/bin/bash
# restart.sh
sudo systemctl restart asterisk
cd dashboard && pkill -f "python app.py"
python app.py &
echo "Система перезапущена"
```

### Очистка логов и записей

```bash
#!/bin/bash
# cleanup.sh
sudo rm -f /var/log/asterisk/full
sudo rm -f /var/log/asterisk/agi
sudo rm -f /tmp/recordings/*.wav
sudo rm -f /tmp/calls.db
echo "Логи и записи очищены"
```

### Мониторинг в реальном времени

```bash
#!/bin/bash
# monitor.sh
watch -n 1 '
echo "=== АКТИВНЫЕ КАНАЛЫ ==="
sudo asterisk -rx "core show channels" | head -20
echo ""
echo "=== ПОСЛЕДНИЕ ЗВОНКИ ==="
sqlite3 /tmp/calls.db "SELECT caller_number, urgency, category FROM calls ORDER BY timestamp DESC LIMIT 3;" 2>/dev/null || echo "База данных не найдена"
'
```

## 9. Демонстрационный режим

Для быстрой демонстрации используйте готовый скрипт:

```bash
# Запустите демо-скрипт
python demo_script.py

# Или используйте готовый сценарий
python -c "
from services.llm_service import LLMService
from services.classifier import IncidentClassifier

service = LLMService(engine='mock')
classifier = IncidentClassifier()

test_cases = [
    'Менің машинам ұрланды',
    'Біреу пышақпен шабуыл жасады',
    'Көршілер айқайласып жатыр'
]

for i, text in enumerate(test_cases):
    print(f'Тест {i+1}: {text}')
    result = service.analyze_incident(text, 'ru')
    print(f'Результат: {result}')
    print()
"
```

## 10. Дальнейшие шаги

После успешного запуска в тестовом режиме:

1. **Настройте реальный SIP trunk** для приема звонков с реальных номеров
2. **Получите API ключи** для OpenAI/DeepSeek
3. **Настройте базу данных** PostgreSQL для production использования
4. **Настройте мониторинг** и алертинг
5. **Протестируйте с реальными пользователями**

## 11. Готовые команды для копирования

```bash
# Полная установка одной командой (Ubuntu)
sudo apt update && sudo apt install -y asterisk python3.10 python3.10-venv git && \
git clone <репозиторий> && cd ai-call-intake-system && \
python3.10 -m venv venv && source venv/bin/activate && \
pip install fastapi uvicorn openai-whisper openai TTS asterisk-agi && \
sudo cp asterisk/config/* /etc/asterisk/ && \
sudo cp agi/call_handler.py /var/lib/asterisk/agi-bin/ && \
sudo chmod +x /var/lib/asterisk/agi-bin/call_handler.py && \
sudo systemctl restart asterisk && \
echo "✅ Установка завершена! Запустите тестовый звонок: sudo asterisk -rx 'channel originate SIP/500 extension 500@internal-test'"
```

**Система готова к использованию!** Для вопросов и поддержки обратитесь к полной документации в `INSTALLATION_GUIDE.md` и `TESTING_GUIDE.md`.
