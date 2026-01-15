#!/bin/bash
# ============================================
# AI CALL INTAKE SYSTEM - ПОЛНЫЙ ЗАПУСК
# ============================================
# Запуск всей системы одной командой
# ============================================

set -e

# Цвета для вывода
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
        echo "Установите Docker: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose не установлен"
        echo "Установите Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_success "Docker и Docker Compose установлены"
}

# Проверка OpenAI API ключа
check_api_key() {
    if [ -z "$OPENAI_API_KEY" ]; then
        if [ -f ".env" ]; then
            source .env
        elif [ -f "production.env" ]; then
            source production.env
        fi
    fi
    
    if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sk-test-key" ]; then
        print_warning "OpenAI API ключ не установлен или тестовый"
        read -p "Введите ваш OpenAI API ключ: " api_key
        if [ -n "$api_key" ]; then
            export OPENAI_API_KEY="$api_key"
            echo "OPENAI_API_KEY=$api_key" > .env.docker
            print_success "API ключ сохранен"
        else
            print_warning "Будет использован тестовый режим (mock)"
            export OPENAI_API_KEY="sk-test-key"
        fi
    else
        print_success "OpenAI API ключ найден"
    fi
}

# Создание необходимых директорий
create_directories() {
    print_info "Создание директорий..."
    
    mkdir -p nginx/ssl
    mkdir -p monitoring/prometheus
    mkdir -p monitoring/grafana/dashboards
    mkdir -p monitoring/grafana/datasources
    mkdir -p logs
    mkdir -p recordings
    
    print_success "Директории созданы"
}

# Создание конфигурационных файлов
create_configs() {
    print_info "Создание конфигурационных файлов..."
    
    # Nginx конфигурация
    cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server ai-backend:8000;
    }

    upstream dashboard {
        server dashboard:5000;
    }

    server {
        listen 80;
        server_name _;
        
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        location / {
            proxy_pass http://dashboard;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        location /health {
            proxy_pass http://backend/health;
        }
    }
}
EOF

    # Prometheus конфигурация
    cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'ai-call-backend'
    static_configs:
      - targets: ['ai-backend:8000']
    
  - job_name: 'ai-call-dashboard'
    static_configs:
      - targets: ['dashboard:5000']
    
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
EOF

    # Grafana datasource
    cat > monitoring/grafana/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

    print_success "Конфигурационные файлы созданы"
}

# Запуск системы
start_system() {
    print_header "ЗАПУСК AI CALL INTAKE SYSTEM"
    
    print_info "Проверка зависимостей..."
    check_docker
    check_api_key
    
    print_info "Подготовка системы..."
    create_directories
    create_configs
    
    print_info "Запуск Docker Compose..."
    docker-compose up -d
    
    # Ожидание запуска сервисов
    print_info "Ожидание запуска сервисов..."
    sleep 30
    
    # Проверка статуса
    check_status
    
    print_success "Система запущена!"
    show_access_info
}

# Остановка системы
stop_system() {
    print_header "ОСТАНОВКА AI CALL INTAKE SYSTEM"
    
    docker-compose down
    
    print_success "Система остановлена"
}

# Перезапуск системы
restart_system() {
    print_header "ПЕРЕЗАПУСК AI CALL INTAKE SYSTEM"
    
    docker-compose restart
    
    print_success "Система перезапущена"
}

# Проверка статуса
check_status() {
    print_header "СТАТУС СИСТЕМЫ"
    
    echo -e "${YELLOW}=== Контейнеры ===${NC}"
    docker-compose ps
    
    echo -e "\n${YELLOW}=== Логи последних 5 строк ===${NC}"
    for service in asterisk ai-backend dashboard; do
        echo -e "${BLUE}--- $service ---${NC}"
        docker-compose logs --tail=5 $service 2>/dev/null || echo "Сервис $service не найден"
        echo
    done
    
    echo -e "${YELLOW}=== Проверка здоровья ===${NC}"
    curl -s http://localhost/health || echo "Сервис недоступен"
    echo
}

# Показать информацию для доступа
show_access_info() {
    print_header "ИНФОРМАЦИЯ ДЛЯ ДОСТУПА"
    
    IP_ADDRESS=$(hostname -I | awk '{print $1}')
    
    cat << EOF
${GREEN}🌐 ВЕБ-ИНТЕРФЕЙСЫ:${NC}
   • Dashboard: ${GREEN}http://${IP_ADDRESS}/${NC}
   • API: ${GREEN}http://${IP_ADDRESS}/api${NC}
   • API Health: ${GREEN}http://${IP_ADDRESS}/health${NC}
   • Prometheus: ${GREEN}http://${IP_ADDRESS}:9090${NC}
   • Grafana: ${GREEN}http://${IP_ADDRESS}:3000${NC}

${GREEN}📞 ТЕЛЕФОНИЯ:${NC}
   • SIP Сервер: ${GREEN}${IP_ADDRESS}:5060${NC}
   • Тестовый номер: ${GREEN}500${NC}
   • Пароль: ${GREEN}500${NC}
   • RTP порты: ${GREEN}10000-20000${NC}

${GREEN}🔐 ГРАФАНА:${NC}
   • Логин: ${GREEN}admin${NC}
   • Пароль: ${GREEN}admin${NC}

${GREEN}📊 КОМАНДЫ УПРАВЛЕНИЯ:${NC}
   • Статус: ${GREEN}docker-compose ps${NC}
   • Логи: ${GREEN}docker-compose logs -f [сервис]${NC}
   • Остановка: ${GREEN}docker-compose down${NC}
   • Перезапуск: ${GREEN}docker-compose restart${NC}

${YELLOW}⚠ ТЕСТОВЫЙ ЗВОНОК:${NC}
   docker-compose exec asterisk asterisk -rx "channel originate Local/500@internal-test application Playback hello-world"

${GREEN}✅ СИСТЕМА ГОТОВА К РАБОТЕ!${NC}
EOF
}

# Обновление системы
update_system() {
    print_header "ОБНОВЛЕНИЕ СИСТЕМЫ"
    
    print_info "Остановка системы..."
    docker-compose down
    
    print_info "Обновление образов..."
    docker-compose pull
    
    print_info "Запуск обновленной системы..."
    docker-compose up -d
    
    print_success "Система обновлена"
}

# Бэкап данных
backup_data() {
    print_header "БЭКАП ДАННЫХ"
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="backups/backup_$TIMESTAMP"
    
    mkdir -p "$BACKUP_DIR"
    
    print_info "Создание бэкапа..."
    
    # Бэкап базы данных
    docker-compose exec -T postgres pg_dump -U ai_user ai_calls > "$BACKUP_DIR/database.sql"
    
    # Бэкап конфигураций
    cp -r asterisk/config "$BACKUP_DIR/"
    cp -r nginx "$BACKUP_DIR/"
    cp -r monitoring "$BACKUP_DIR/"
    cp docker-compose.yml "$BACKUP_DIR/"
    cp .env* "$BACKUP_DIR/" 2>/dev/null || true
    
    # Архивирование
    tar -czf "backups/ai-call-backup-$TIMESTAMP.tar.gz" -C backups "backup_$TIMESTAMP"
    rm -rf "$BACKUP_DIR"
    
    print_success "Бэкап создан: backups/ai-call-backup-$TIMESTAMP.tar.gz"
}

# Восстановление из бэкапа
restore_backup() {
    print_header "ВОССТАНОВЛЕНИЕ ИЗ БЭКАПА"
    
    if [ -z "$1" ]; then
        print_error "Укажите файл бэкапа"
        echo "Использование: $0 restore backups/ai-call-backup-YYYYMMDD_HHMMSS.tar.gz"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Файл бэкапа не найден: $BACKUP_FILE"
        exit 1
    fi
    
    print_info "Остановка системы..."
    docker-compose down
    
    print_info "Распаковка бэкапа..."
    tar -xzf "$BACKUP_FILE" -C /tmp
    
    BACKUP_DIR=$(find /tmp -name "backup_*" -type d | head -1)
    
    if [ -z "$BACKUP_DIR" ]; then
        print_error "Не удалось найти данные бэкапа"
        exit 1
    fi
    
    print_info "Восстановление конфигураций..."
    cp -r "$BACKUP_DIR/asterisk/config" asterisk/
    cp -r "$BACKUP_DIR/nginx" ./
    cp -r "$BACKUP_DIR/monitoring" ./
    cp "$BACKUP_DIR/docker-compose.yml" ./
    cp "$BACKUP_DIR/.env"* . 2>/dev/null || true
    
    print_info "Восстановление базы данных..."
    docker-compose up -d postgres
    sleep 10
    docker-compose exec -T postgres psql -U ai_user -d ai_calls -f /docker-entrypoint-initdb.d/init.sql
    cat "$BACKUP_DIR/database.sql" | docker-compose exec -T postgres psql -U ai_user -d ai_calls
    
    print_info "Запуск системы..."
    docker-compose up -d
    
    print_success "Восстановление завершено"
}

# Очистка системы
cleanup_system() {
    print_header "ОЧИСТКА СИСТЕМЫ"
    
    read -p "Вы уверены? Это удалит ВСЕ данные (контейнеры, volumes). (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Очистка отменена"
        return
    fi
    
    print_info "Остановка и удаление контейнеров..."
    docker-compose down -v
    
    print_info "Удаление образов..."
    docker-compose rm -f
    
    print_info "Очистка директорий..."
    rm -rf nginx/ssl/* monitoring/grafana/data/* logs/* recordings/*
    
    print_success "Система полностью очищена"
}

# Показать помощь
show_help() {
    print_header "ПОМОЩЬ - AI CALL INTAKE SYSTEM"
    
    cat << EOF
${GREEN}Использование:${NC}
  $0 [команда]

${GREEN}Команды:${NC}
  start       - Запустить всю систему
  stop        - Остановить систему
  restart     - Перезапустить систему
  status      - Показать статус системы
  update      - Обновить систему
  backup      - Создать бэкап данных
  restore FILE- Восстановить из бэкапа
  cleanup     - Полностью очистить систему (удалить ВСЕ данные)
  help        - Показать эту помощь

${GREEN}Примеры:${NC}
  $0 start          # Запустить систему
  $0 status         # Проверить статус
  $0 backup         # Создать бэкап
  $0 restore backups/ai-call-backup-20251230_120000.tar.gz

${GREEN}Быстрый старт:${NC}
  1. Установите Docker и Docker Compose
  2. Выполните: $0 start
  3. Откройте: http://ваш-ip/
  4. Позвоните на: 500@ваш-ip:5060

${YELLOW}Примечание:${NC}
  • Для работы нужен OpenAI API ключ
  • При первом запуске будет запрошен ключ
  • Система использует порты: 80, 443, 5060, 5000, 3000, 9090
EOF
}

# Основная логика
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
            check_status
            ;;
        update)
            update_system
            ;;
        backup)
            backup_data
            ;;
        restore)
            restore_backup "$2"
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

# Запуск основной функции
main "$@"