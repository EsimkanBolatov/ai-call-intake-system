# 🎯 НАСТРОЙКА ZADARMA ДЛЯ AI CALL INTAKE SYSTEM

## ✅ ЧТО У ВАС УЖЕ ЕСТЬ

1. ✅ Аккаунт Zadarma: https://my.zadarma.com/
2. ✅ Docker установлен
3. ✅ OpenAI API ключ

## 📋 ШАГИ ДЛЯ НАСТРОЙКИ

### Шаг 1: Получите SIP данные от Zadarma

1. Войдите в https://my.zadarma.com/
2. Перейдите: **SIP → Мои SIP номера**
3. Нажмите на ваш номер → **Настройки SIP**
4. Скопируйте:
   - **SIP ID** (например: `1234567`)
   - **SIP пароль** (скрыт, нажмите "Показать")
   - **SIP сервер**: `sip.zadarma.com`

### Шаг 2: Запустите систему

```bash
# 1. Скачайте проект
git clone <ваш-репозиторий>
cd ai-call-intake-system

# 2. Запустите систему
chmod +x run_local_free.sh
./run_local_free.sh start
```

### Шаг 3: Настройте Zadarma в Asterisk

Создайте файл `asterisk/config/zadarma.conf`:

```ini
[zadarma]
type=peer
host=sip.zadarma.com
defaultuser=ВАШ_SIP_ID          # Например: 1234567
secret=ВАШ_SIP_ПАРОЛЬ          # Пароль из настроек SIP
context=incoming
fromuser=ВАШ_SIP_ID
qualify=yes
nat=force_rport,comedia
disallow=all
allow=ulaw
allow=alaw
allow=gsm
dtmfmode=rfc2833
```

### Шаг 4: Настройте extensions для Zadarma

Добавьте в `asterisk/config/extensions.conf`:

```ini
[incoming]
; Zadarma звонки
exten => _X.,1,NoOp(═► Входящий звонок от Zadarma)
 same => n,Answer()
 same => n,Wait(1)
 same => n,MixMonitor(${UNIQUEID}.wav,ab)
 same => n,Set(LANG=kk)
 same => n,AGI(agi://127.0.0.1/call_handler.py,${CALLERID(num)},${LANG})
 same => n,Hangup()
```

### Шаг 5: Перезапустите Asterisk

```bash
docker restart ai-call-local-asterisk
```

## 🔧 ПРОВЕРКА ПОДКЛЮЧЕНИЯ

### Проверка 1: Статус регистрации

```bash
docker exec ai-call-local-asterisk asterisk -rx "sip show registry"
```

**Должно показать:**

```
Host                    Username    State
sip.zadarma.com:5060   1234567     Registered
```

### Проверка 2: SIP пиры

```bash
docker exec ai-call-local-asterisk asterisk -rx "sip show peers"
```

**Должно показать вашего пира как OK**

### Проверка 3: Тестовый звонок

```bash
# Изнутри системы
docker exec ai-call-local-asterisk asterisk -rx "channel originate Local/500@internal-test"

# Или позвоните с телефона на ваш Zadarma номер
```

## 📞 КАК ЭТО БУДЕТ РАБОТАТЬ

```
Ваш телефон → Zadarma сервер → Ваш компьютер (Docker) → AI анализ
       ↓
   Номер Zadarma → SIP trunk → Asterisk → ИИ обработка
```

### Пример звонка:

1. Кто-то звонит на ваш Zadarma номер
2. Zadarma перенаправляет звонок на ваш компьютер
3. Asterisk принимает звонок
4. AI система отвечает: "102 қызметінің автоматты көмекшісісіз"
5. ИИ анализирует речь, классифицирует инцидент
6. Все данные сохраняются в dashboard

## 🐛 УСТРАНЕНИЕ ПРОБЛЕМ

### Проблема: Нет регистрации в Zadarma

```bash
# Проверьте firewall
sudo ufw allow 5060/udp
sudo ufw allow 10000:20000/udp

# Проверьте настройки
docker exec ai-call-local-asterisk cat /etc/asterisk/zadarma.conf
```

### Проблема: Zadarma не видит ваш компьютер

1. **Пробросьте порты на роутере:**

   - Порт 5060 UDP → ваш локальный IP
   - Порты 10000-20000 UDP → ваш локальный IP

2. **Или используйте ngrok для туннеля:**

```bash
# Установите ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Создайте туннель для SIP
ngrok config add-authtoken ваш-токен
ngrok udp 5060

# Используйте ngrok адрес в Zadarma:
# SIP сервер: [ngrok-адрес].ngrok.io
```

### Проблема: Нет звука

```bash
# Проверьте кодеки
docker exec ai-call-local-asterisk asterisk -rx "core show translation"

# Zadarma поддерживает: ulaw, alaw, gsm
```

## 🎯 БЫСТРАЯ КОМАНДА ДЛЯ НАСТРОЙКИ

```bash
#!/bin/bash
# setup_zadarma.sh

echo "Настройка Zadarma..."
echo "Введите данные из личного кабинета:"

read -p "SIP ID: " sip_id
read -sp "SIP Пароль: " sip_password
echo

# Создаем конфигурацию
cat > asterisk/config/zadarma.conf << EOF
[zadarma]
type=peer
host=sip.zadarma.com
defaultuser=$sip_id
secret=$sip_password
context=incoming
fromuser=$sip_id
qualify=yes
nat=force_rport,comedia
disallow=all
allow=ulaw
allow=alaw
allow=gsm
dtmfmode=rfc2833
EOF

echo "Конфигурация создана!"
echo "Перезапускаем Asterisk..."
docker restart ai-call-local-asterisk

echo "Проверяем регистрацию..."
sleep 5
docker exec ai-call-local-asterisk asterisk -rx "sip show registry"
```

## 📊 ЧТО ДАЛЬШЕ ПОСЛЕ НАСТРОЙКИ

### 1. Протестируйте звонок

- Позвоните с другого телефона на ваш Zadarma номер
- Или попросите друга позвонить

### 2. Проверьте dashboard

- Откройте `http://localhost:5000`
- Должен появиться новый звонок

### 3. Настройте уведомления (опционально)

```python
# В services/logger.py добавьте отправку в Telegram
TELEGRAM_BOT_TOKEN = "ваш-токен"
TELEGRAM_CHAT_ID = "ваш-chat-id"
```

### 4. Настройте резервное копирование

```bash
# Ежедневный бэкап
crontab -e
# Добавьте:
0 2 * * * cd /path/to/ai-call-intake-system && ./run_local_free.sh backup
```

## ✅ ЧТО ВЫ ПОЛУЧИТЕ

После настройки Zadarma:

1. ✅ **Реальный телефонный номер** для приема звонков
2. ✅ **Бесплатные входящие** (зависит от тарифа Zadarma)
3. ✅ **AI анализ** каждого звонка
4. ✅ **Dashboard** с историей звонков
5. ✅ **JSON отчеты** по каждому инциденту
6. ✅ **Локальное хранение** всех данных

## 🆘 ЕСЛИ ВОЗНИКЛИ ПРОБЛЕМЫ

### Обратитесь в поддержку Zadarma:

- **Чат поддержки** в личном кабинете
- **Email**: support@zadarma.com
- **Документация**: https://zadarma.com/ru/support/

### Или проверьте логи:

```bash
# Логи Asterisk
docker logs -f ai-call-local-asterisk

# Логи AI системы
docker logs -f ai-call-local-backend

# Логи регистрации SIP
docker exec ai-call-local-asterisk asterisk -rx "sip set debug on"
```

## 🚀 ЗАПУСК СИСТЕМЫ С ZADARMA

```bash
# 1. Запустите систему
./run_local_free.sh start

# 2. Настройте Zadarma (используйте скрипт выше)
chmod +x setup_zadarma.sh
./setup_zadarma.sh

# 3. Протестируйте
# Позвоните на ваш Zadarma номер с любого телефона

# 4. Проверьте результаты
# Откройте http://localhost:5000
```

**Система готова принимать реальные звонки через ваш Zadarma номер!**
