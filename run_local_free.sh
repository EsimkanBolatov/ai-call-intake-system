#!/bin/bash
# ============================================
# БЕСПЛАТНЫЙ ЛОКАЛЬНЫЙ ЗАПУСК
# AI Call Intake System на вашем компьютере
# ============================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Проверка Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker не установлен"
        echo "Установите Docker Desktop:"
        echo "Windows: https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        echo "Mac: https://desktop.docker.com/mac/main/amd64/Docker.dmg"
        echo "Linux: sudo apt install docker.io docker-compose"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker не запущен"
        echo "Запустите Docker Desktop и попробуйте снова"
        exit 1
    fi
    
    print_success "Docker готов"
}

# Создание директорий
create_directories() {
    print_info "Создание директорий..."
    
    mkdir -p data
    mkdir -p recordings
    mkdir -p logs
    mkdir -p tts_cache
    mkdir -p scripts
    
    print_success "Директории созданы"
}

# Создание тестового скрипта
create_test_script() {
    print_info "Создание тестового скрипта..."
    
    cat > scripts/test_call.py << 'EOF'
#!/usr/bin/env python3
"""
Тестовый скрипт для локального запуска
"""
import subprocess
import time
import sqlite3
import os

def test_system():
    print("=== ТЕСТ ЛОКАЛЬНОЙ СИСТЕМЫ ===")
    
    # 1. Проверка контейнеров
    print("1. Проверка контейнеров...")
    result = subprocess.run(['docker', 'ps'], capture_output=True, text=True)
    if 'ai-call-local' in result.stdout:
        print("   ✓ Контейнеры запущены")
    else:
        print("   ✗ Контейнеры не найдены")
    
    # 2. Проверка базы данных
    print("2. Проверка базы данных...")
    if os.path.exists('data/calls.db'):
        conn = sqlite3.connect('data/calls.db')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        if tables:
            print(f"   ✓ База данных создана ({len(tables)} таблиц)")
        else:
            print("   ✗ База данных пуста")
        conn.close()
    else:
        print("   ✗ Файл базы данных не найден")
    
    # 3. Проверка dashboard
    print("3. Проверка dashboard...")
    try:
        import requests
        response = requests.get('http://localhost:5000', timeout=5)
        if response.status_code == 200:
            print("   ✓ Dashboard работает")
        else:
            print(f"   ✗ Dashboard ошибка: {response.status_code}")
    except Exception as e:
        print(f"   ✗ Dashboard недоступен: {e}")
    
    # 4. Тестовый звонок
    print("4. Тестовый звонок...")
    try:
        result = subprocess.run([
            'docker', 'exec', 'ai-call-local-asterisk',
            'asterisk', '-rx', 
            'channel originate Local/500@internal-test application Playback hello-world'
        ], capture_output=True, text=True, timeout=10)
        print("   ✓ Тестовый звонок отправлен")
    except Exception as e:
        print(f"   ✗ Ошибка тестового звонка: {e}")
    
    print("=== ТЕСТ ЗАВЕРШЕН ===")

if __name__ == "__main__":
    test_system()
EOF
    
    chmod +x scripts/test_call.py
    print_success "Тестовый скрипт создан"
}

# Запуск системы
start_system() {
    print_header "ЗАПУСК БЕСПЛАТНОЙ ЛОКАЛЬНОЙ ВЕРСИИ"
    
    print_info "Проверка Docker..."
    check_docker
    
    print_info "Подготовка файлов..."
    create_directories
    create_test_script
    
    print_info "Остановка предыдущих контейнеров..."
    docker-compose -f docker-compose-local.yml down 2>/dev/null || true
    
    print_info "Запуск контейнеров..."
    docker-compose -f docker-compose-local.yml up -d
    
    print_info "Ожидание запуска сервисов..."
    sleep 20
    
    print_success "Система запущена!"
    show_access_info
    
    # Автоматический тест
    print_info "Запуск автоматического теста..."
    python3 scripts/test_call.py
}

# Остановка системы
stop_system() {
    print_header "ОСТАНОВКА СИСТЕМЫ"
    
    docker-compose -f docker-compose-local.yml down
    
    print_success "Система остановлена"
}

# Перезапуск
restart_system() {
    print_header "ПЕРЕЗАПУСК СИСТЕМЫ"
    
    stop_system
    sleep 5
    start_system
}

# Статус
status_system() {
    print_header "СТАТУС СИСТЕМЫ"
    
    echo -e "${YELLOW}=== КОНТЕЙНЕРЫ ===${NC}"
    docker-compose -f docker-compose-local.yml ps
    
    echo -e "\n${YELLOW}=== ПОСЛЕДНИЕ ЛОГИ ===${NC}"
    for service in asterisk ai-backend dashboard; do
        echo -e "${BLUE}--- $service ---${NC}"
        docker-compose -f docker-compose-local.yml logs --tail=5 $service 2>/dev/null || echo "Сервис не найден"
        echo
    done
    
    echo -e "${YELLOW}=== БАЗА ДАННЫХ ===${NC}"
    if [ -f "data/calls.db" ]; then
        sqlite3 data/calls.db "SELECT COUNT(*) as 'Всего звонков', 
                              strftime('%Y-%m-%d', timestamp) as Дата,
                              COUNT(*) as 'Звонков за день'
                              FROM calls 
                              GROUP BY strftime('%Y-%m-%d', timestamp)
                              ORDER BY Дата DESC
                              LIMIT 3;" 2>/dev/null || echo "База данных пуста"
    else
        echo "База данных не создана"
    fi
}

# Показать информацию для доступа
show_access_info() {
    print_header "ИНФОРМАЦИЯ ДЛЯ ДОСТУПА"
    
    cat << EOF
${GREEN}🌐 ЛОКАЛЬНЫЕ АДРЕСА:${NC}
   • Dashboard: ${GREEN}http://localhost:5000/${NC}
   • API: ${GREEN}http://localhost:8000/${NC}
   • API Health: ${GREEN}http://localhost:8000/health${NC}

${GREEN}📞 ТЕЛЕФОНИЯ:${NC}
   • SIP Сервер: ${GREEN}localhost:5060${NC}
   • Тестовый номер: ${GREEN}500${NC}
   • Пароль: ${GREEN}500${NC}
   • Локальный SIP: ${GREEN}600${NC} (пароль: 600)

${GREEN}🔐 DASHBOARD:${NC}
   • Логин: ${GREEN}admin${NC}
   • Пароль: ${GREEN}ChangeMe123!${NC}

${GREEN}🛠 КОМАНДЫ:${NC}
   • Тестовый звонок: ${GREEN}docker exec ai-call-local-asterisk asterisk -rx "channel originate Local/500@internal-test"${NC}
   • Логи: ${GREEN}docker-compose -f docker-compose-local.yml logs -f [сервис]${NC}
   • Остановка: ${GREEN}docker-compose -f docker-compose-local.yml down${NC}

${YELLOW}⚠ ДЛЯ ТЕСТИРОВАНИЯ:${NC}
   1. Установите MicroSIP: https://www.microsip.org
   2. Настройте: Серver=localhost, Порт=5060, Логин=500, Пароль=500
   3. Позвоните на номер 500

${GREEN}✅ СИСТЕМА ГОТОВА К ТЕСТИРОВАНИЮ НА ВАШЕМ КОМПЬЮТЕРЕ!${NC}
EOF
}

# Обновление
update_system() {
    print_header "ОБНОВЛЕНИЕ СИСТЕМЫ"
    
    print_info "Остановка системы..."
    docker-compose -f docker-compose-local.yml down
    
    print_info "Обновление образов..."
    docker-compose -f docker-compose-local.yml pull
    
    print_info "Запуск обновленной системы..."
    docker-compose -f docker-compose-local.yml up -d
    
    print_success "Система обновлена"
}

# Очистка
cleanup_system() {
    print_header "ОЧИСТКА СИСТЕМЫ"
    
    read -p "Удалить ВСЕ данные (звонки, записи, логи)? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Очистка отменена"
        return
    fi
    
    print_info "Остановка и удаление контейнеров..."
    docker-compose -f docker-compose-local.yml down -v
    
    print_info "Удаление данных..."
    rm -rf data/* recordings/* logs/* tts_cache/*
    
    print_success "Система полностью очищена"
}

# Помощь
show_help() {
    print_header "ПОМОЩЬ - БЕСПЛАТНАЯ ЛОКАЛЬНАЯ ВЕРСИЯ"
    
    cat << EOF
${GREEN}Использование:${NC}
  $0 [команда]

${GREEN}Команды:${NC}
  start    - Запустить систему на вашем компьютере
  stop     - Остановить систему
  restart  - Перезапустить систему
  status   - Показать статус
  update   - Обновить систему
  cleanup  - Полностью очистить (удалить ВСЕ данные)
  help     - Показать эту помощь

${GREEN}Примеры:${NC}
  $0 start     # Запустить систему
  $0 status    # Проверить статус
  $0 cleanup   # Очистить все данные

${GREEN}Быстрый старт:${NC}
  1. Установите Docker Desktop
  2. Выполните: $0 start
  3. Откройте: http://localhost:5000
  4. Протестируйте: установите MicroSIP и позвоните на 500@localhost

${YELLOW}Примечание:${NC}
  • Работает полностью БЕСПЛАТНО на вашем компьютере
  • Использует локальные порты: 5060, 5000, 8000
  • Данные сохраняются в папке ./data
  • Для ИИ используется mock режим (или ваш OpenAI ключ)
EOF
}

# Основная функция
main() {
    COMMAND=${1:-start}
    
    case $COMMAND in
        start)
            start_system
            ;;
        stop)
            stop_system
            ;;
        restart)
            restart_system
            ;;
        status)
            status_system
            ;;
        update)
            update_system
            ;;
        cleanup)
            cleanup_system
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Неизвестная команда: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Запуск
main "$@"