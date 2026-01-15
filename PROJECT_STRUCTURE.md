# Полная структура проекта AI Call Intake System

```
ai-call-intake-system/
├── README.md                          # Основная документация
├── start_local.bat                    # Скрипт запуска для Windows
├── test_call_emulation.py             # Тестовый скрипт эмуляции звонков
├── TESTING.md                         # Инструкции по тестированию
├── PROJECT_STRUCTURE.md               # Этот файл
│
├── agi/                               # AGI скрипты для Asterisk
│   └── call_handler.py                # Основной обработчик звонков
│
├── asterisk/                          # Конфигурация Asterisk
│   ├── README.md                      # Инструкции по установке Asterisk
│   └── config/
│       ├── asterisk.conf              # Основная конфигурация Asterisk
│       ├── extensions.conf            # Диалплан для обработки звонков
│       └── sip.conf                   # SIP конфигурация
│
├── dashboard/                         # Flask dashboard для мониторинга
│   ├── app.py                         # Основное Flask приложение
│   ├── requirements.txt               # Зависимости для dashboard
│   ├── static/                        # Статические файлы (CSS, JS)
│   └── templates/
│       └── index.html                 # HTML шаблон dashboard
│
├── docs/                              # Документация
│   ├── API.md                         # API документация
│   ├── ARCHITECTURE_ASCII.md          # Архитектурная схема в ASCII
│   ├── EDGE_CASES.md                  # Обработка edge cases
│   ├── JSON_FORMAT.md                 # Формат JSON вывода ИИ
│   └── SECURITY_AND_LIMITS.md         # Безопасность и ограничения
│
├── services/                          # Python сервисы
│   ├── __init__.py                    # Пакет services
│   ├── stt_service.py                 # Сервис распознавания речи (Whisper)
│   ├── llm_service.py                 # Сервис LLM (OpenAI/DeepSeek)
│   ├── tts_service.py                 # Сервис синтеза речи (Coqui/OpenAI)
│   ├── classifier.py                  # Классификатор инцидентов
│   └── logger.py                      # Сервис логирования в БД
│
├── ai-module/                         # Существующий AI модуль (legacy)
│   ├── .env                           # Переменные окружения
│   ├── .env.example                   # Пример .env файла
│   ├── Dockerfile                     # Docker конфигурация
│   ├── main.py                        # Основной файл FastAPI
│   ├── requirements.txt               # Зависимости Python
│   └── services/
│       ├── nlp_classifier.py          # NLP классификатор
│       ├── priority_detector.py       # Детектор приоритета
│       └── speech_to_text.py          # STT сервис
│
├── backend/                           # NestJS backend (существующий)
│   ├── .env                           # Переменные окружения
│   ├── .env.example                   # Пример .env файла
│   ├── Dockerfile                     # Docker конфигурация
│   ├── nest-cli.json                  # Конфигурация NestJS CLI
│   ├── package.json                   # Зависимости Node.js
│   ├── package-lock.json              # Lock файл зависимостей
│   ├── tsconfig.json                  # Конфигурация TypeScript
│   └── src/
│       ├── app.module.ts              # Корневой модуль приложения
│       ├── health.controller.ts       # Контроллер health check
│       ├── main.ts                    # Точка входа приложения
│       └── modules/
│           ├── ai/                    # AI модуль
│           ├── audio/                 # Аудио модуль
│           ├── auth/                  # Аутентификация
│           ├── cases/                 # Обращения (cases)
│           ├── organizations/         # Организации
│           ├── reports/               # Отчеты
│           ├── telegram/              # Telegram интеграция
│           └── users/                 # Пользователи
│
├── frontend/                          # React frontend (существующий)
│   ├── .env                           # Переменные окружения
│   ├── .env.example                   # Пример .env файла
│   ├── Dockerfile                     # Docker конфигурация
│   ├── eslint.config.js               # Конфигурация ESLint
│   ├── index.html                     # HTML шаблон
│   ├── package.json                   # Зависимости Node.js
│   ├── package-lock.json              # Lock файл зависимостей
│   ├── README.md                      # Документация frontend
│   ├── tsconfig.json                  # Конфигурация TypeScript
│   ├── tsconfig.app.json              # Конфигурация приложения
│   ├── tsconfig.node.json             # Конфигурация Node
│   ├── vite.config.ts                 # Конфигурация Vite
│   └── src/
│       ├── App.css                    # Стили приложения
│       ├── App.tsx                    # Корневой компонент
│       ├── index.css                  # Глобальные стили
│       ├── main.tsx                   # Точка входа
│       └── components/                # React компоненты
│
├── database/                          # Базы данных
│   └── init.sql                       # SQL скрипты инициализации
│
├── deployment/                        # Деплоймент
│   └── docker-compose.yml             # Docker Compose конфигурация
│
├── integration/                       # Интеграции с внешними системами
│
└── scripts/                           # Вспомогательные скрипты
```

## Описание ключевых файлов

### 1. Основные компоненты системы

**agi/call_handler.py** - Главный обработчик звонков:

- Интеграция с Asterisk AGI
- Оркестрация STT → LLM → TTS
- Обработка диалога с пользователем
- Логирование результатов

**services/** - Python сервисы:

- `stt_service.py`: Распознавание речи через Whisper/Google STT
- `llm_service.py`: Анализ инцидентов через OpenAI/DeepSeek
- `tts_service.py`: Синтез речи через Coqui/OpenAI TTS
- `classifier.py`: Rule-based классификация и валидация
- `logger.py`: Логирование в SQLite/PostgreSQL

**asterisk/config/** - Конфигурация телефонии:

- `extensions.conf`: Диалплан с AGI интеграцией
- `sip.conf`: Настройки SIP trunk
- `asterisk.conf`: Основная конфигурация Asterisk

### 2. Документация

**docs/ARCHITECTURE_ASCII.md** - Архитектурная схема системы в ASCII формате

**docs/JSON_FORMAT.md** - Строгий формат JSON вывода ИИ с примерами

**docs/EDGE_CASES.md** - Обработка edge cases (тихие звонящие, эмоции, неразборчивая речь и т.д.)

**docs/SECURITY_AND_LIMITS.md** - Политики безопасности, ограничения, rate limiting

### 3. Dashboard

**dashboard/app.py** - Flask приложение для мониторинга:

- Просмотр звонков в реальном времени
- Статистика и аналитика
- Экспорт данных
- Health check системы

**dashboard/templates/index.html** - Веб-интерфейс с Chart.js графиками

### 4. Существующие компоненты (legacy)

**ai-module/** - Существующий AI модуль на FastAPI
**backend/** - Существующий NestJS backend
**frontend/** - Существующий React frontend

## Требования к окружению

### Обязательные компоненты

1. **Asterisk 18+** - телефония
2. **Python 3.10+** - обработка звонков и AI
3. **SQLite/PostgreSQL** - хранение данных
4. **Docker** (опционально) - контейнеризация

### AI зависимости

```bash
# STT
pip install openai-whisper  # или google-cloud-speech

# LLM
pip install openai  # или deepseek-api

# TTS
pip install TTS  # Coqui TTS
```

### Конфигурационные файлы

- `.env` - переменные окружения (API ключи, пути)
- `asterisk/config/*.conf` - конфигурация Asterisk
- `services/config.py` - конфигурация Python сервисов

## Порядок запуска системы

1. **Установка Asterisk** и копирование конфигураций
2. **Настройка Python окружения** и установка зависимостей
3. **Конфигурация .env файлов** с API ключами
4. **Запуск Asterisk** с загруженными конфигурациями
5. **Запуск Python сервисов** (при необходимости)
6. **Запуск Dashboard** для мониторинга
7. **Тестирование** через тестовые звонки

## Масштабирование

### Горизонтальное масштабирование

1. **Несколько Asterisk серверов** с балансировкой нагрузки
2. **Микросервисная архитектура** для STT/LLM/TTS
3. **Redis** для кэширования и очередей
4. **Kubernetes** для оркестрации контейнеров

### Вертикальное масштабирование

1. **Более мощные GPU** для Whisper и Coqui TTS
2. **Увеличение RAM** для загрузки больших моделей
3. **Быстрое хранилище** для аудиозаписей

## Мониторинг и обслуживание

### Логи

- `/var/log/asterisk/` - логи Asterisk
- `/var/log/ai-call-intake/` - логи приложения
- SQLite база с историей звонков

### Метрики

- Количество обработанных звонков
- Среднее время обработки
- Точность классификации
- Загрузка системы

### Резервное копирование

- Ежедневное копирование базы данных
- Архивация аудиозаписей
- Конфигурационные файлы в Git
