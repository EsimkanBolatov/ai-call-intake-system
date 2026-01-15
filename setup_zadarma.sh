#!/bin/bash

# setup_zadarma.sh - Автоматическая настройка Zadarma для AI Call Intake System

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          НАСТРОЙКА ZADARMA ДЛЯ AI CALL INTAKE SYSTEM         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📞 Этот скрипт настроит интеграцию с Zadarma для приема звонков"
echo ""

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установите Docker Desktop."
    exit 1
fi

# Проверка запущенной системы
if ! docker ps | grep -q "ai-call-local-asterisk"; then
    echo "⚠️  Система не запущена. Запустите сначала:"
    echo "   ./run_local_free.sh start"
    echo ""
    read -p "Запустить систему сейчас? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./run_local_free.sh start
        sleep 10
    else
        echo "❌ Прерывание. Сначала запустите систему."
        exit 1
    fi
fi

echo ""
echo "📋 ШАГ 1: Получите данные из личного кабинета Zadarma"
echo "======================================================"
echo "1. Войдите в https://my.zadarma.com/"
echo "2. Перейдите: SIP → Мои SIP номера"
echo "3. Нажмите на ваш номер → Настройки SIP"
echo "4. Скопируйте SIP ID и SIP пароль"
echo ""

read -p "SIP ID (например: 1234567): " SIP_ID
read -sp "SIP Пароль (скрытый): " SIP_PASSWORD
echo ""

if [ -z "$SIP_ID" ] || [ -z "$SIP_PASSWORD" ]; then
    echo "❌ SIP ID и пароль обязательны!"
    exit 1
fi

echo ""
echo "📋 ШАГ 2: Создание конфигурации Zadarma"
echo "========================================"

# Создаем конфигурацию Zadarma
cat > asterisk/config/zadarma.conf << EOF
; Конфигурация Zadarma SIP trunk
; Создано автоматически $(date)

[zadarma]
type=peer
host=sip.zadarma.com
defaultuser=$SIP_ID
secret=$SIP_PASSWORD
context=incoming
fromuser=$SIP_ID
qualify=yes
nat=force_rport,comedia
disallow=all
allow=ulaw
allow=alaw
allow=gsm
dtmfmode=rfc2833
canreinvite=no
insecure=invite,port
directmedia=no
transport=udp
EOF

echo "✅ Конфигурация создана: asterisk/config/zadarma.conf"

# Добавляем включение в sip.conf
if ! grep -q "#include zadarma.conf" asterisk/config/sip.conf; then
    echo "" >> asterisk/config/sip.conf
    echo "; Zadarma SIP trunk" >> asterisk/config/sip.conf
    echo "#include zadarma.conf" >> asterisk/config/sip.conf
    echo "✅ Добавлено включение в sip.conf"
fi

echo ""
echo "📋 ШАГ 3: Настройка extensions для входящих звонков"
echo "==================================================="

# Проверяем наличие контекста incoming в extensions.conf
if ! grep -q "\[incoming\]" asterisk/config/extensions.conf; then
    cat >> asterisk/config/extensions.conf << EOF

; Контекст для входящих звонков от Zadarma
[incoming]
exten => _X.,1,NoOp(═► Входящий звонок от Zadarma)
 same => n,Answer()
 same => n,Wait(1)
 same => n,MixMonitor(\${UNIQUEID}.wav,ab)
 same => n,Set(LANG=kk)
 same => n,AGI(agi://127.0.0.1/call_handler.py,\${CALLERID(num)},\${LANG})
 same => n,Hangup()
EOF
    echo "✅ Добавлен контекст [incoming] в extensions.conf"
else
    echo "✅ Контекст [incoming] уже существует"
fi

echo ""
echo "📋 ШАГ 4: Перезапуск Asterisk"
echo "=============================="

docker restart ai-call-local-asterisk
echo "⏳ Ожидание перезапуска Asterisk..."
sleep 5

echo ""
echo "📋 ШАГ 5: Проверка регистрации"
echo "==============================="

echo "Проверяем статус регистрации в Zadarma..."
REG_STATUS=$(docker exec ai-call-local-asterisk asterisk -rx "sip show registry" 2>/dev/null | grep "zadarma" || true)

if echo "$REG_STATUS" | grep -q "Registered"; then
    echo "✅ УСПЕХ: Zadarma зарегистрирован!"
    echo "$REG_STATUS"
else
    echo "⚠️  ВНИМАНИЕ: Zadarma еще не зарегистрирован"
    echo "Это может занять до 60 секунд."
    echo ""
    echo "Текущий статус:"
    docker exec ai-call-local-asterisk asterisk -rx "sip show registry"
fi

echo ""
echo "📋 ШАГ 6: Проверка SIP пиров"
echo "============================="

PEER_STATUS=$(docker exec ai-call-local-asterisk asterisk -rx "sip show peers" 2>/dev/null | grep "zadarma" || true)
echo "$PEER_STATUS"

echo ""
echo "📋 ШАГ 7: Настройка firewall (если нужно)"
echo "=========================================="

echo "Если у вас есть firewall, откройте порты:"
echo "  - 5060 UDP (SIP)"
echo "  - 10000-20000 UDP (RTP медиа)"
echo ""
echo "Для Windows Firewall:"
echo "  netsh advfirewall firewall add rule name=\"SIP\" dir=in action=allow protocol=UDP localport=5060"
echo "  netsh advfirewall firewall add rule name=\"RTP\" dir=in action=allow protocol=UDP localport=10000-20000"
echo ""
echo "Для Linux:"
echo "  sudo ufw allow 5060/udp"
echo "  sudo ufw allow 10000:20000/udp"

echo ""
echo "📋 ШАГ 8: Тестирование"
echo "======================"

echo "1. Позвоните на ваш Zadarma номер с другого телефона"
echo "2. Или используйте тестовый звонок:"
echo "   docker exec ai-call-local-asterisk asterisk -rx \"channel originate Local/500@internal-test\""
echo ""
echo "3. Проверьте dashboard: http://localhost:5000"
echo "   Логин: admin"
echo "   Пароль: ChangeMe123!"

echo ""
echo "📋 ШАГ 9: Мониторинг"
echo "===================="

echo "Для просмотра логов:"
echo "  # Логи Asterisk"
echo "  docker logs -f ai-call-local-asterisk"
echo ""
echo "  # Логи регистрации"
echo "  docker exec ai-call-local-asterisk asterisk -rx \"sip set debug on\""
echo ""
echo "  # Логи AI системы"
echo "  docker logs -f ai-call-local-backend"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     НАСТРОЙКА ЗАВЕРШЕНА!                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Zadarma настроен для приема звонков!"
echo ""
echo "📞 Ваш номер Zadarma теперь будет:"
echo "   1. Принимать входящие звонки"
echo "   2. Перенаправлять их в AI систему"
echo "   3. Анализировать речь с помощью ИИ"
echo "   4. Сохранять результаты в dashboard"
echo ""
echo "🔧 Если возникли проблемы:"
echo "   1. Проверьте логи: docker logs ai-call-local-asterisk"
echo "   2. Убедитесь что порты открыты на роутере"
echo "   3. Проверьте настройки в личном кабинете Zadarma"
echo ""
echo "📊 Для проверки работы:"
echo "   Откройте http://localhost:5000 и посмотрите историю звонков"
echo ""
echo "🚀 Удачи с вашей AI Call Intake System!"