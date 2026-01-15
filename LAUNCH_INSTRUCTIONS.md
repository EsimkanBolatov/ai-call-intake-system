# 🚀 КАК ЗАПУСТИТЬ AI CALL INTAKE SYSTEM

## 📋 БЫСТРЫЙ СТАРТ (3 ШАГА)

### Шаг 1: Установите Ubuntu Server

1. Скачайте Ubuntu 22.04 LTS: https://ubuntu.com/download/server
2. Установите на сервер или виртуальную машину
3. Подключитесь по SSH: `ssh username@ваш-сервер-ip`

### Шаг 2: Запустите автоматическую установку

```bash
# 1. Обновите систему
sudo apt update && sudo apt upgrade -y

# 2. Установите Git
sudo apt install -y git

# 3. Скачайте проект
git clone https://github.com/ваш-репозиторий/ai-call-intake-system.git
cd ai-call-intake-system

# 4. Запустите установку
sudo bash install_kazakh.sh
```

### Шаг 3: Запустите систему

```bash
# 1. Проверьте статус
sudo bash manage_system.sh status

# 2. Запустите все сервисы
sudo bash manage_system.sh start

# 3. Отправьте тестовый звонок
sudo bash manage_system.sh test

# 4. Откройте dashboard
# В браузере: http://ваш-сервер-ip:5000
# Логин: admin
# Пароль: ChangeMe123!
```

## 🖥 ДЕТАЛЬНАЯ ИНСТРУКЦИЯ

### 1. ПОДГОТОВКА СЕРВЕРА

#### Требования:

- Ubuntu 20.04/22.04 LTS
- 4 ГБ ОЗУ (рекомендуется 8+ ГБ)
- 20 ГБ свободного места
- Статический IP адрес

#### Команды для подготовки:

```bash
# Войдите на сервер
ssh username@ваш-сервер-ip

# Станьте root
sudo -i

# Установите базовые пакеты
apt install -y curl wget nano htop
```

### 2. УСТАНОВКА СИСТЕМЫ

#### Вариант A: Автоматическая установка (рекомендуется)

```bash
cd /opt
git clone https://github.com/ваш-репозиторий/ai-call-intake-system.git
cd ai-call-intake-system
sudo bash install_kazakh.sh
```

#### Вариант B: Ручная установка

```bash
# 1. Установите Asterisk
sudo apt install -y asterisk

# 2. Установите Python
sudo apt install -y python3.10 python3.10-venv

# 3. Создайте virtual environment
cd /opt
mkdir ai-call-intake
cd ai-call-intake
python3.10 -m venv venv
source venv/bin/activate

# 4. Установите зависимости
pip install fastapi uvicorn openai-whisper openai TTS asterisk-agi

# 5. Скопируйте конфигурации
cd ai-call-intake-system
sudo cp asterisk/config/* /etc/asterisk/
sudo cp agi/call_handler.py /var/lib/asterisk/agi-bin/
sudo chmod +x /var/lib/asterisk/agi-bin/call_handler.py

# 6. Настройте .env файл
cp production.env .env
# Отредактируйте .env файл: nano .env
# Добавьте ваш OpenAI API ключ

# 7. Перезапустите Asterisk
sudo systemctl restart asterisk
```

### 3. НАСТРОЙКА OPENAI API КЛЮЧА

Ваш ключ уже в файле `production.env`, но проверьте:

```bash
# Проверьте что ключ установлен
cat /opt/ai-call-intake/ai-call-intake-system/.env | grep OPENAI_API_KEY

# Если нужно изменить
nano /opt/ai-call-intake/ai-call-intake-system/.env
# Найдите строку: OPENAI_API_KEY=sk-proj-...
# Убедитесь что ваш ключ правильный
```

### 4. ЗАПУСК СЕРВИСОВ

#### Используйте скрипт управления:

```bash
cd /opt/ai-call-intake/ai-call-intake-system

# Запустите все сервисы
sudo bash manage_system.sh start

# Проверьте статус
sudo bash manage_system.sh status

# Должны увидеть:
# ✓ asterisk - running
# ✓ ai-call-intake - running
# ✓ ai-call-dashboard - running
```

#### Или вручную:

```bash
sudo systemctl start asterisk
sudo systemctl start ai-call-intake
sudo systemctl start ai-call-dashboard

# Включите автозапуск
sudo systemctl enable asterisk
sudo systemctl enable ai-call-intake
sudo systemctl enable ai-call-dashboard
```

### 5. ТЕСТИРОВАНИЕ РАБОТЫ

#### Тест 1: Проверка сервисов

```bash
# 1. Проверьте Asterisk
sudo asterisk -rx "core show channels"
# Должно показать: "0 active channels"

# 2. Проверьте базу данных
sqlite3 /var/lib/ai-call-intake/calls.db "SELECT COUNT(*) FROM calls;"
# Должно показать количество записей

# 3. Проверьте dashboard
curl http://localhost:5000
# Должен вернуть HTML страницу
```

#### Тест 2: Тестовый звонок

```bash
# Способ 1: Через скрипт
sudo bash manage_system.sh test

# Способ 2: Через Asterisk CLI
sudo asterisk -rvvv
# В консоли Asterisk выполните:
# channel originate SIP/500 extension 500@internal-test

# Способ 3: С SIP телефона
# Настройте SIP телефон:
# Сервер: ваш-сервер-ip
# Порт: 5060
# Логин: 500
# Пароль: 500
# Позвоните на номер 500
```

#### Тест 3: Проверка логов

```bash
# Смотрите логи в реальном времени
sudo tail -f /var/log/asterisk/full

# Или используйте скрипт
sudo bash manage_system.sh logs
```

### 6. ДОСТУП К DASHBOARD

#### Веб-интерфейс:

- **URL**: `http://ваш-сервер-ip:5000`
- **Логин**: `admin`
- **Пароль**: `ChangeMe123!`

#### Измените пароль (рекомендуется):

```bash
# Отредактируйте .env файл
nano /opt/ai-call-intake/ai-call-intake-system/.env
# Найдите: DASHBOARD_PASSWORD=ChangeMe123!
# Измените на свой пароль

# Перезапустите dashboard
sudo systemctl restart ai-call-dashboard
```

### 7. НАСТРОЙКА SIP TRUNK (ДЛЯ РЕАЛЬНЫХ ЗВОНКОВ)

#### Для приема звонков с реальных номеров:

1. **Получите SIP trunk** у провайдера (например, Twilio, VoIP.ms)
2. **Настройте `sip.conf`**:

```bash
sudo nano /etc/asterisk/sip.conf
```

Добавьте:

```ini
[your-provider]
type=peer
host=sip.your-provider.com
defaultuser=your_username
secret=your_password
context=incoming
```

3. **Настройте `extensions.conf`**:

```bash
sudo nano /etc/asterisk/extensions.conf
```

Убедитесь что есть:

```ini
[incoming]
exten => _X.,1,AGI(agi://127.0.0.1/call_handler.py,${CALLERID(num)},kk)
```

4. **Перезапустите Asterisk**:

```bash
sudo systemctl restart asterisk
```

### 8. КОМАНДЫ ДЛЯ ПОВСЕДНЕВНОГО ИСПОЛЬЗОВАНИЯ

```bash
# 📊 Мониторинг
sudo bash manage_system.sh status      # Статус всех сервисов
sudo bash manage_system.sh monitor     # Реальный мониторинг
sudo bash manage_system.sh logs        # Просмотр логов

# 🔧 Управление
sudo bash manage_system.sh start       # Запустить все
sudo bash manage_system.sh stop        # Остановить все
sudo bash manage_system.sh restart     # Перезапустить все

# 🧪 Тестирование
sudo bash manage_system.sh test        # Тестовый звонок
sudo asterisk -rx "core show channels" # Активные каналы

# 💾 Обслуживание
sudo bash manage_system.sh backup      # Создать бэкап
sudo bash manage_system.sh update      # Обновить систему
sudo bash manage_system.sh cleanup     # Очистить логи
```

### 9. УСТРАНЕНИЕ НЕПОЛАДОК

#### Проблема: Asterisk не запускается

```bash
# Проверьте ошибки
sudo systemctl status asterisk
sudo journalctl -u asterisk -f

# Проверьте конфигурацию
sudo asterisk -rx "core show channels"
```

#### Проблема: Нет звука

```bash
# Проверьте кодекы
sudo asterisk -rx "core show translation"

# Проверьте RTP
sudo asterisk -rx "rtp show stats"

# Откройте порты в firewall
sudo ufw allow 5060/udp
sudo ufw allow 10000:20000/udp
```

#### Проблема: ИИ не отвечает

```bash
# Проверьте API ключ
cat .env | grep OPENAI_API_KEY

# Проверьте подключение к OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer ваш-ключ"

# Проверьте логи ИИ
sudo tail -f /var/log/ai-call-intake/agi.log
```

#### Проблема: Dashboard не открывается

```bash
# Проверьте порт
sudo netstat -tulpn | grep :5000

# Проверьте сервис
sudo systemctl status ai-call-dashboard

# Проверьте firewall
sudo ufw allow 5000/tcp
```

### 10. ВАЖНЫЕ ФАЙЛЫ И ПУТИ

```
/opt/ai-call-intake/ai-call-intake-system/  # Основная директория
├── .env                                    # Конфигурация (API ключи)
├── install_kazakh.sh                       # Скрипт установки
├── manage_system.sh                        # Скрипт управления
└── asterisk/config/                        # Конфигурации Asterisk

/var/lib/ai-call-intake/                    # Данные
├── calls.db                                # База данных звонков
└── recordings/                             # Аудиозаписи (опционально)

/var/log/ai-call-intake/                    # Логи
├── agi.log                                 # Логи AGI скрипта
└── calls.log                               # Логи звонков

/var/spool/asterisk/monitor/                # Записи звонков
```

### 11. БЫСТРЫЕ КОМАНДЫ ДЛЯ КОПИРОВАНИЯ

```bash
# Полная установка одной командой
cd /tmp && git clone https://github.com/ваш-репозиторий/ai-call-intake-system.git && \
cd ai-call-intake-system && sudo bash install_kazakh.sh && \
sudo bash manage_system.sh start && sudo bash manage_system.sh test

# Проверка работы
IP=$(hostname -I | awk '{print $1}') && \
echo "Dashboard: http://$IP:5000" && \
echo "SIP тест: 500@$IP" && \
echo "Пароль: ChangeMe123!"

# Создание тестового звонка
sudo asterisk -rx "channel originate SIP/500 extension 500@internal-test" && \
sleep 10 && \
sqlite3 /var/lib/ai-call-intake/calls.db "SELECT * FROM calls ORDER BY timestamp DESC LIMIT 1;"
```

## ✅ СИСТЕМА ЗАПУЩЕНА!

После выполнения этих шагов система будет:

1. ✅ Принимать SIP звонки на порт 5060
2. ✅ Автоматически отвечать на казахском/русском
3. ✅ Анализировать речь с помощью ИИ
4. ✅ Классифицировать инциденты
5. ✅ Сохранять все данные в базу
6. ✅ Предоставлять веб-интерфейс для мониторинга

**Для начала работы просто позвоните на номер 500 с SIP телефона!**
