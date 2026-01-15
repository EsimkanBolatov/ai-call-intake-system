#!/bin/bash
# ============================================
# AI CALL INTAKE SYSTEM - БАСҚАРУ СКРИПТІ
# ============================================
# Бұл скрипт жүйені басқаруға арналған
# Орындау: sudo bash manage_system.sh [команда]
# ============================================

set -e

# Түстер
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Негізгі айнымалылар
SYSTEM_USER="asterisk"
APP_DIR="/opt/ai-call-intake/ai-call-intake-system"
VENV_DIR="/opt/ai-call-intake/venv"
LOG_DIR="/var/log/ai-call-intake"
DB_PATH="/var/lib/ai-call-intake/calls.db"

print_header() {
    echo -e "${BLUE}"
    echo "========================================="
    echo "  $1"
    echo "========================================="
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "Бұл скриптті root ретінде орындау керек"
        exit 1
    fi
}

check_system() {
    if [ ! -d "$APP_DIR" ]; then
        print_error "Қолданба директориясы табылмады: $APP_DIR"
        exit 1
    fi
    
    if [ ! -d "$VENV_DIR" ]; then
        print_error "Virtual environment табылмады: $VENV_DIR"
        exit 1
    fi
}

# ============================================
# КОМАНДАЛАР
# ============================================

start_all() {
    print_header "ЖҮЙЕНІ БАСТАУ"
    
    systemctl start asterisk
    systemctl start ai-call-intake
    systemctl start ai-call-dashboard
    
    sleep 2
    
    print_info "Сервис статустары:"
    systemctl status asterisk --no-pager -l | head -10
    systemctl status ai-call-intake --no-pager -l | head -10
    systemctl status ai-call-dashboard --no-pager -l | head -10
    
    print_success "Жүйе басталды"
}

stop_all() {
    print_header "ЖҮЙЕНІ ТОҚТАТУ"
    
    systemctl stop ai-call-dashboard
    systemctl stop ai-call-intake
    systemctl stop asterisk
    
    print_success "Жүйе тоқтатылды"
}

restart_all() {
    print_header "ЖҮЙЕНІ ҚАЙТА ЖҮКТЕУ"
    
    stop_all
    start_all
    
    print_success "Жүйе қайта жүктелді"
}

status() {
    print_header "ЖҮЙЕ СТАТУСЫ"
    
    echo -e "${YELLOW}=== АСТЕРИСК СТАТУСЫ ===${NC}"
    systemctl status asterisk --no-pager -l | head -20
    
    echo -e "\n${YELLOW}=== AI СЕРВИС СТАТУСЫ ===${NC}"
    systemctl status ai-call-intake --no-pager -l | head -20
    
    echo -e "\n${YELLOW}=== DASHBOARD СТАТУСЫ ===${NC}"
    systemctl status ai-call-dashboard --no-pager -l | head -20
    
    echo -e "\n${YELLOW}=== АКТИВТІ ҚОҢЫРАУЛАР ===${NC}"
    asterisk -rx "core show channels" 2>/dev/null || echo "Asterisk жұмыс істемейді"
    
    echo -e "\n${YELLOW}=== БАЗА ДАННЫХ ===${NC}"
    if [ -f "$DB_PATH" ]; then
        sqlite3 "$DB_PATH" "SELECT COUNT(*) as 'Қоңыраулар саны', 
                            strftime('%Y-%m-%d', timestamp) as Күні,
                            COUNT(*) as Саны
                            FROM calls 
                            GROUP BY strftime('%Y-%m-%d', timestamp)
                            ORDER BY Күні DESC
                            LIMIT 5;" 2>/dev/null || echo "База данных қатесі"
    else
        echo "База данных файлы жоқ"
    fi
}

logs() {
    print_header "ЛОГТАРДЫ КӨРУ"
    
    echo "1. Asterisk логтары (соңғы 50 жол):"
    tail -50 /var/log/asterisk/full
    
    echo -e "\n2. AI Call Intake логтары:"
    tail -50 /var/log/ai-call-intake/agi.log 2>/dev/null || echo "Лог файлы жоқ"
    
    echo -e "\n3. Systemd журналы:"
    journalctl -u ai-call-intake -n 20 --no-pager
    
    echo -e "\n4. Dashboard логтары:"
    journalctl -u ai-call-dashboard -n 20 --no-pager
}

test_call() {
    print_header "ТЕСТ ҚОҢЫРАУЫ"
    
    read -p "Қоңырау нөмірі (әдепкі: 500): " number
    number=${number:-500}
    
    read -p "Тіл (kk/ru, әдепкі: kk): " language
    language=${language:-kk}
    
    print_info "Тест қоңырауы басталуда: $number, тіл: $language"
    
    # Қоңырау бастау
    asterisk -rx "channel originate Local/$number@internal-test application Playback hello-world" &
    
    # Күту
    sleep 5
    
    # Нәтижені тексеру
    print_info "Соңғы қоңыраулар:"
    sqlite3 "$DB_PATH" "SELECT caller_number, language, timestamp FROM calls ORDER BY timestamp DESC LIMIT 3;" 2>/dev/null || echo "База данных қатесі"
    
    print_success "Тест қоңырауы аяқталды"
}

backup() {
    print_header "ДЕРЕКТЕРДІ НҰСҚАЛАУ"
    
    BACKUP_DIR="/var/backups/ai-call-intake"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
    
    mkdir -p "$BACKUP_DIR"
    
    # Деректерді нұсқалау
    tar -czf "$BACKUP_FILE" \
        /var/lib/ai-call-intake \
        /etc/asterisk/*.conf \
        /opt/ai-call-intake/ai-call-intake-system/.env \
        /var/log/ai-call-intake 2>/dev/null || true
    
    # База данныхты нұсқалау
    if [ -f "$DB_PATH" ]; then
        sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/calls_$TIMESTAMP.db"
    fi
    
    # Ескі нұсқаларды жою (30 күннен ескі)
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
    find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
    
    print_success "Нұсқалау аяқталды: $BACKUP_FILE"
    print_info "Нұсқа өлшемі: $(du -h "$BACKUP_FILE" | cut -f1)"
}

restore() {
    print_header "ДЕРЕКТЕРДІ ҚАЛПЫНА КЕЛТІРУ"
    
    BACKUP_DIR="/var/backups/ai-call-intake"
    
    # Соңғы нұсқаны табу
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        print_error "Нұсқалар табылмады"
        return 1
    fi
    
    print_info "Соңғы нұсқа: $LATEST_BACKUP"
    read -p "Қалпына келтіресіз бе? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    # Жүйені тоқтату
    stop_all
    
    # Нұсқадан қалпына келтіру
    tar -xzf "$LATEST_BACKUP" -C /
    
    # База данныхты қалпына келтіру
    LATEST_DB=$(ls -t "$BACKUP_DIR"/*.db 2>/dev/null | head -1)
    if [ -n "$LATEST_DB" ] && [ -f "$DB_PATH" ]; then
        cp "$LATEST_DB" "$DB_PATH"
        chown asterisk:asterisk "$DB_PATH"
    fi
    
    # Жүйені қайта бастау
    start_all
    
    print_success "Деректер қалпына келтірілді"
}

update() {
    print_header "ЖҮЙЕНІ ЖАҢАРТУ"
    
    # Проектті жаңарту
    cd "$APP_DIR"
    
    print_info "Git арқылы жаңарту..."
    git pull origin main
    
    # Төменділіктерді жаңарту
    print_info "Python төменділіктерін жаңарту..."
    source "$VENV_DIR/bin/activate"
    pip install -r requirements.txt --upgrade
    
    # Конфигурацияларды жаңарту
    print_info "Asterisk конфигурациясын жаңарту..."
    cp "$APP_DIR/asterisk/config/"* /etc/asterisk/ 2>/dev/null || true
    chown asterisk:asterisk /etc/asterisk/*.conf
    
    # AGI скрипті
    cp "$APP_DIR/agi/call_handler.py" /var/lib/asterisk/agi-bin/
    chmod +x /var/lib/asterisk/agi-bin/call_handler.py
    chown asterisk:asterisk /var/lib/asterisk/agi-bin/call_handler.py
    
    # Systemd қайта жүктеу
    systemctl daemon-reload
    
    # Жүйені қайта бастау
    restart_all
    
    print_success "Жүйе жаңартылды"
}

cleanup() {
    print_header "ЖҮЙЕНІ ТАЗАЛАУ"
    
    read -p "Барлық логтарды және жазбаларды жоясыз ба? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 0
    fi
    
    # Жүйені тоқтату
    stop_all
    
    # Логтарды жою
    rm -f /var/log/asterisk/full
    rm -f /var/log/asterisk/agi
    rm -f /var/log/ai-call-intake/*
    
    # Жазбаларды жою
    rm -f /var/spool/asterisk/monitor/*.wav
    rm -f /var/spool/ai-call-intake/tts/*
    
    # База данныхты тазалау (тек ескі деректерді)
    if [ -f "$DB_PATH" ]; then
        sqlite3 "$DB_PATH" "DELETE FROM calls WHERE timestamp < datetime('now', '-7 days');"
        sqlite3 "$DB_PATH" "VACUUM;"
    fi
    
    # Жүйені қайта бастау
    start_all
    
    print_success "Жүйе тазаланды"
}

monitor() {
    print_header "НАҚТЫ УАҚЫТТА МОНИТОРИНГ"
    
    print_info "Мониторинг басталды (Ctrl+C тоқтату үшін)"
    echo -e "${YELLOW}Қысқаша ақпарат:${NC}"
    echo "  • Asterisk статусы"
    echo "  • Қоңыраулар саны"
    echo "  • Жаңа қоңыраулар"
    echo "  • Жүйе жүктемесі"
    
    watch -n 2 '
        echo "=== $(date) ==="
        echo "--- Asterisk ---"
        asterisk -rx "core show channels" 2>/dev/null | grep -E "(active|calls)" | head -2
        echo "--- Қоңыраулар ---"
        sqlite3 /var/lib/ai-call-intake/calls.db "SELECT strftime(\"%H:%M:%S\", timestamp) as Уақыт, 
                                                  caller_number as Нөмір, 
                                                  urgency as Срочность
                                                  FROM calls 
                                                  ORDER BY timestamp DESC 
                                                  LIMIT 3" 2>/dev/null || echo "База қатесі"
        echo "--- Жүйе ---"
        top -bn1 | head -5 | tail -2
    '
}

help() {
    print_header "КОМАНДАЛАР ТІЗІМІ"
    
    cat << EOF
${GREEN}Бастау/тоқтату:${NC}
  start      - Барлық сервистерді бастау
  stop       - Барлық сервистерді тоқтату
  restart    - Барлық сервистерді қайта жүктеу
  status     - Жүйе статусын көрсету

${GREEN}Басқару:${NC}
  logs       - Логтарды көрсету
  test       - Тест қоңырауын жіберу
  monitor    - Нақты уақытта мониторинг

${GREEN}Деректер:${NC}
  backup     - Деректерді нұсқалау
  restore    - Деректерді қалпына келтіру
  cleanup    - Логтарды және жазбаларды тазалау

${GREEN}Жаңарту:${NC}
  update     - Жүйені жаңарту (Git арқылы)

${GREEN}Көмек:${NC}
  help       - Бұл ақпаратты көрсету

${YELLOW}Мысалдар:${NC}
  sudo bash manage_system.sh start
  sudo bash manage_system.sh status
  sudo bash manage_system.sh test
  sudo bash manage_system.sh logs
EOF
}

# ============================================
# НЕГІЗГІ ЛОГИКА
# ============================================

main() {
    check_root
    check_system
    
    COMMAND=${1:-help}
    
    case $COMMAND in
        start)
            start_all
            ;;
        stop)
            stop_all
            ;;
        restart)
            restart_all
            ;;
        status)
            status
            ;;
        logs)
            logs
            ;;
        test)
            test_call
            ;;
        backup)
            backup
            ;;
        restore)
            restore
            ;;
        cleanup)
            cleanup
            ;;
        update)
            update
            ;;
        monitor)
            monitor
            ;;
        help|*)
            help
            ;;
    esac
}

# Скриптті бастау
main "$@"