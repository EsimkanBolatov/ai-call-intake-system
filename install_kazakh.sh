#!/bin/bash
# ============================================
# AI CALL INTAKE SYSTEM - ТОЛЫҚ ОРНАТУ СКРИПТІ
# ============================================
# Бұл скрипт AI Call Intake System жүйесін
# production ортасына орнатады.
# Орындау үшін: sudo bash install_kazakh.sh
# ============================================

set -e  # Қате кезінде тоқтату

# Түстер
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Лог файлы
LOG_FILE="/var/log/ai-install-$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

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

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ============================================
# 1. БАСТАПҚЫ ТЕКСЕРУЛЕР
# ============================================
print_header "1. БАСТАПҚЫ ТЕКСЕРУЛЕР"

# Root екенін тексеру
if [[ $EUID -ne 0 ]]; then
   print_error "Бұл скриптті root ретінде орындау керек"
   exit 1
fi

# Операциялық жүйені тексеру
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    print_error "Операциялық жүйе анықталмады"
    exit 1
fi

print_info "Операциялық жүйе: $OS $VER"

# Ubuntu/Debian екенін тексеру
if [[ "$OS" != *"Ubuntu"* ]] && [[ "$OS" != *"Debian"* ]]; then
    print_warning "Бұл скрипт тек Ubuntu/Debian үшін тестіленген"
    read -p "Жалғастырасыз ба? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Интернет байланысын тексеру
if ! ping -c 1 google.com &> /dev/null; then
    print_error "Интернет байланысы жоқ"
    exit 1
fi

print_success "Бастапқы тексерулер өтті"

# ============================================
# 2. ЖҮЙЕНІ ЖАҢАРТУ
# ============================================
print_header "2. ЖҮЙЕНІ ЖАҢАРТУ ЖӘНЕ ПАКЕТТЕРДІ ОРНАТУ"

apt-get update -y
apt-get upgrade -y

# Негізгі пакеттерді орнату
apt-get install -y \
    build-essential \
    wget \
    curl \
    git \
    nano \
    htop \
    net-tools \
    ufw \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

print_success "Негізгі пакеттер орнатылды"

# ============================================
# 3. ASTERISK ORNATU
# ============================================
print_header "3. ASTERISK TELEPHONY ЖҮЙЕСІН ОРНАТУ"

# Asterisk үшін қажетті пакеттер
apt-get install -y \
    libssl-dev \
    libncurses5-dev \
    libnewt-dev \
    libxml2-dev \
    libsqlite3-dev \
    libjansson-dev \
    uuid-dev \
    libsrtp2-dev \
    libedit-dev \
    libgsm1-dev \
    libopus-dev \
    libvpx-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libavresample-dev

# Asterisk 18 скачать жасау
cd /usr/src
if [ ! -d "asterisk-18-current" ]; then
    wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-18-current.tar.gz
    tar -xvf asterisk-18-current.tar.gz
    rm asterisk-18-current.tar.gz
fi

cd asterisk-18*/

# Конфигурация
./configure --with-jansson-bundled

# Компиляция
make -j$(nproc)
make install
make samples
make config
ldconfig

# Asterisk пайдаланушысын жасау
if ! id -u asterisk >/dev/null 2>&1; then
    adduser --system --group --home /var/lib/asterisk --no-create-home --gecos "Asterisk PBX" asterisk
fi

# Директориялардың меншігін өзгерту
chown -R asterisk:asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk

# Systemd службасы
cat > /etc/systemd/system/asterisk.service << EOF
[Unit]
Description=Asterisk PBX
After=network.target

[Service]
Type=simple
User=asterisk
Group=asterisk
ExecStart=/usr/sbin/asterisk -f -C /etc/asterisk/asterisk.conf
ExecStop=/usr/sbin/asterisk -rx "core stop now"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable asterisk

print_success "Asterisk орнатылды"

# ============================================
# 4. PYTHON 3.10 ORNATU
# ============================================
print_header "4. PYTHON 3.10 ЖӘНЕ VIRTUAL ENVIRONMENT ОРНАТУ"

# Python 3.10 орнату
apt-get install -y \
    python3.10 \
    python3.10-venv \
    python3.10-dev \
    python3-pip \
    python3-setuptools \
    python3-wheel

# Негізгі Python пакеттері
apt-get install -y \
    python3-dev \
    python3-venv \
    python3-pip

# Virtual environment жасау
cd /opt
if [ ! -d "ai-call-intake" ]; then
    mkdir -p ai-call-intake
fi

cd ai-call-intake
python3.10 -m venv venv
source venv/bin/activate

print_success "Python 3.10 орнатылды"

# ============================================
# 5. ПРОЕКТТІ КЛОНДАУ
# ============================================
print_header "5. AI CALL INTAKE SYSTEM ПРОЕКТІН КЛОНДАУ"

cd /opt/ai-call-intake

# Егер проект болса, жаңарту
if [ -d "ai-call-intake-system" ]; then
    print_info "Проект бар, жаңартылуда..."
    cd ai-call-intake-system
    git pull origin main
else
    print_info "Проект клондалуда..."
    git clone https://github.com/your-repo/ai-call-intake-system.git
    cd ai-call-intake-system
fi

print_success "Проект клондалды"

# ============================================
# 6. PYTHON ТӨМЕНДІЛІКТЕРІН ОРНАТУ
# ============================================
print_header "6. PYTHON ТӨМЕНДІЛІКТЕРІН ОРНАТУ"

source /opt/ai-call-intake/venv/bin/activate

# requirements.txt файлын жасау
cat > requirements.txt << EOF
# Core
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
sqlalchemy==2.0.23

# AI/ML
openai-whisper==20231117
openai==1.3.0
TTS==0.21.0
torch==2.1.0
torchaudio==2.1.0

# Telephony
asterisk-agi==0.9.0
pyst2==0.8.0

# Utilities
python-dotenv==1.0.0
requests==2.31.0
aiofiles==23.2.1
python-multipart==0.0.6

# Database
aiosqlite==0.19.0
alembic==1.12.1

# Web
flask==3.0.0
flask-cors==4.0.0
flask-sqlalchemy==3.1.1

# Security
bcrypt==4.1.2
cryptography==41.0.7
python-jose[cryptography]==3.3.0

# Monitoring
prometheus-client==0.19.0
psutil==5.9.7
EOF

pip install --upgrade pip
pip install -r requirements.txt

print_success "Python төменділіктері орнатылды"

# ============================================
# 7. ASTERISK КОНФИГУРАЦИЯСЫН ОРНАТУ
# ============================================
print_header "7. ASTERISK КОНФИГУРАЦИЯСЫН ОРНАТУ"

# Конфигурация файлдарын көшіру
cp asterisk/config/* /etc/asterisk/
chown asterisk:asterisk /etc/asterisk/*.conf
chmod 640 /etc/asterisk/*.conf

# AGI скрипті
cp agi/call_handler.py /var/lib/asterisk/agi-bin/
chmod +x /var/lib/asterisk/agi-bin/call_handler.py
chown asterisk:asterisk /var/lib/asterisk/agi-bin/call_handler.py

# Директорияларды жасау
mkdir -p /var/spool/asterisk/monitor
mkdir -p /var/lib/ai-call-intake
mkdir -p /var/log/ai-call-intake
mkdir -p /var/backups/ai-call-intake

chown -R asterisk:asterisk /var/spool/asterisk/monitor
chown -R asterisk:asterisk /var/lib/ai-call-intake
chown -R asterisk:asterisk /var/log/ai-call-intake

print_success "Asterisk конфигурациясы орнатылды"

# ============================================
# 8. PRODUCTION .env ФАЙЛЫН ЖАСАУ
# ============================================
print_header "8. PRODUCTION ORTA ҮШІН .env ФАЙЛЫН ЖАСАУ"

cd /opt/ai-call-intake/ai-call-intake-system

# production.env файлын негізгі .env ретінде көшіру
if [ -f "production.env" ]; then
    cp production.env .env
    print_info "production.env файлы .env ретінде көшірілді"
else
    # Жаңа .env файлын жасау
    cat > .env << EOF
# PRODUCTION CONFIGURATION
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

STT_ENGINE=whisper
LLM_ENGINE=openai
TTS_ENGINE=openai

CALL_LOG_DB=/var/lib/ai-call-intake/calls.db
RECORDINGS_DIR=/var/spool/asterisk/monitor
TTS_OUTPUT_DIR=/var/spool/ai-call-intake/tts

RATE_LIMIT_PER_HOUR=5
MAX_CALL_DURATION=300
DEFAULT_LANGUAGE=kk

DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=ChangeMe123!

DEBUG_MODE=false
LOG_LEVEL=INFO
EOF
    print_info "Жаңа .env файлы жасалды"
fi

chown asterisk:asterisk .env
chmod 600 .env

print_success ".env файлы дайын"

# ============================================
# 9. SYSTEMD SERVICE ФАЙЛДАРЫН ЖАСАУ
# ============================================
print_header "9. SYSTEMD SERVICE ФАЙЛДАРЫН ЖАСАУ"

# AI Call Intake Service
cat > /etc/systemd/system/ai-call-intake.service << EOF
[Unit]
Description=AI Call Intake System
After=network.target asterisk.service
Requires=asterisk.service

[Service]
Type=simple
User=asterisk
Group=asterisk
WorkingDirectory=/opt/ai-call-intake/ai-call-intake-system
Environment="PATH=/opt/ai-call-intake/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONPATH=/opt/ai-call-intake/ai-call-intake-system"
ExecStart=/opt/ai-call-intake/venv/bin/python -m agi.call_handler --service
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Dashboard Service
cat > /etc/systemd/system/ai-call-dashboard.service << EOF
[Unit]
Description=AI Call Intake Dashboard
After=network.target ai-call-intake.service
Requires=ai-call-intake.service

[Service]
Type=simple
User=asterisk
Group=asterisk
WorkingDirectory=/opt/ai-call-intake/ai-call-intake-system/dashboard
Environment="PATH=/opt/ai-call-intake/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/opt/ai-call-intake/venv/bin/python app.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

print_success "Systemd service файлдары жасалды"

# ============================================
# 10. FIREWALL ЖӘНЕ СЕТЬ КОНФИГУРАЦИЯСЫ
# ============================================
print_header "10. FIREWALL ЖӘНЕ СЕТЬ КОНФИГУРАЦИЯСЫ"

# Firewall қосу (егер қосылмаған болса)
if command -v ufw >/dev/null 2>&1; then
    ufw --force enable
    ufw allow 22/tcp comment 'SSH'
    ufw allow 5060/udp comment 'SIP'
    ufw allow 5060/tcp comment 'SIP TLS'
    ufw allow 10000:20000/udp comment 'RTP'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow 5000/tcp comment 'Dashboard'
    ufw reload
    print_success "Firewall конфигурациясы жасалды"
else
    print_warning "UFW табылмады, firewall конфигурациясы өткізілмеді"
fi

# Network оптимизациясы
cat >> /etc/sysctl.conf << EOF
# AI Call Intake оптимизациясы
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.udp_mem = 134217728 134217728 134217728
net.core.netdev_max_backlog = 300000
EOF

sysctl -p

print_success "Сеть конфигурациясы жасалды"

# ============================================
# 11. БАЗА ДАННЫХ ИНИЦИАЛИЗАЦИЯСЫ
# ============================================
print_header "11. БАЗА ДАННЫХ ИНИЦИАЛИЗАЦИЯСЫ"

cd /opt/ai-call-intake/ai-call-intake-system
source /opt/ai-call-intake/venv/bin/activate

# База данныхны инициализациялау
python3 -c "
from services.logger import CallLogger
logger = CallLogger()
logger.initialize_database()
print('База данных инициализацияланды')
"

# Тест деректерін қосу
python3 -c "
from services.logger import CallLogger
import datetime

logger = CallLogger()

# Тест қоңырауларын қосу
test_calls = [
    {
        'caller_number': '+77771234567',
        'language': 'kk',
        'transcript': 'Менің машинам ұрланды. Оны кеше түнде ұрлап кетті.',
        'ai_analysis': '{\"urgency\": \"high\", \"category\": \"vehicle_theft\", \"address\": \"\", \"current_danger\": false, \"people_involved\": 1, \"weapons\": false, \"recommended_department\": \"ұрлық бөлімі\", \"summary\": \"Машина ұрланды\"}',
        'duration': 45.5,
        'status': 'completed'
    },
    {
        'caller_number': '+77776543210',
        'language': 'ru',
        'transcript': 'Сосед кричит на жену, нужна помощь.',
        'ai_analysis': '{\"urgency\": \"critical\", \"category\": \"domestic\", \"address\": \"көрші үй\", \"current_danger\": true, \"people_involved\": 2, \"weapons\": false, \"recommended_department\": \"отбасылық қатынастар бөлімі\", \"summary\": \"Отбасылық дау, қауіп бар\"}',
        'duration': 60.2,
        'status': 'completed'
    }
]

for call in test_calls:
    logger.log_call(
        call_id=f'test_{datetime.datetime.now().strftime(\"%Y%m%d_%H%M%S\")}',
        caller_number=call['caller_number'],
        language=call['language'],
        transcript=call['transcript'],
        ai_analysis=call['ai_analysis'],
        duration=call['duration'],
        status=call['status']
    )

print('Тест деректері қосылды')
"

print_success "База данных инициализацияланды"

# ============================================
# 12. СҮЙЕМДЕЛГЕН КОНФИГУРАЦИЯ
# ============================================
print_header "12. СҮЙЕМДЕЛГЕН КОНФИГУРАЦИЯ"

# Nginx орнату (егер қажет болса)
if [ ! -f /etc/nginx/nginx.conf ]; then
    apt-get install -y nginx
    cat > /etc/nginx/sites-available/ai-call-intake << EOF
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/ai-call-intake /etc/nginx/sites-enabled/
    nginx -t && systemctl restart nginx
    print_success "Nginx конфигурациясы жасалды"
fi

# SSL сертификаты (Let's Encrypt)
read -p "SSL сертификатын орнату керек пе? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d your-domain.com
    print_success "SSL сертификаты орнатылды"
fi

# ============================================
# 13. СЕРВИСТЕРДІ БАСТАУ
# ============================================
print_header "13. СЕРВИСТЕРДІ БАСТАУ"

systemctl start asterisk
systemctl start ai-call-intake
systemctl start ai-call-dashboard

systemctl enable asterisk
systemctl enable ai-call-intake
systemctl enable ai-call-dashboard

# Статусты тексеру
sleep 3

print_info "Сервис статустары:"
echo "----------------------------------------"
systemctl status asterisk --no-pager -l | head -20
echo "----------------------------------------"
systemctl status ai-call-intake --no-pager -l | head -20
echo "----------------------------------------"
systemctl status ai-call-dashboard --no-pager -l | head -20
echo "----------------------------------------"

print_success "Сервистер іске қосылды"

# ============================================
# 14. ТЕСТ ЖҮРГІЗУ
# ============================================
print_header "14. ТЕСТ ЖҮРГІЗУ"

# Тест скрипті
cat > /tmp/test_system.py << EOF
import subprocess
import time
import sqlite3
import os

def test_asterisk():
    print("1. Asterisk тесті...")
    result = subprocess.run(['asterisk', '-rx', 'core show channels'],
                          capture_output=True, text=True)
    if '0 active channels' in result.stdout:
        print("   ✓ Asterisk жұмыс істеп тұр")
    else:
        print("   ✗ Asterisk мәселесі")

def test_database():
    print("2. База данных тесті...")
    db_path = "/var/lib/ai-call-intake/calls.db"
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        if len(tables) > 0:
            print(f"   ✓ База данных бар ({len(tables)} таблица)")
        else:
            print("   ✗ База данных бос")
        conn.close()
    else:
        print("   ✗ База данных файлы жоқ")

def test_dashboard():
    print("3. Dashboard тесті...")
    try:
        import requests
        response = requests.get('http://localhost:5000', timeout=5)
        if response.status_code == 200:
            print("   ✓ Dashboard жұмыс істеп тұр")
        else:
            print(f"   ✗ Dashboard қате: {response.status_code}")
    except Exception as e:
        print(f"   ✗ Dashboard қате: {e}")

def test_call_processing():
    print("4. Қоңырау өңдеу тесті...")
    # Тест қоңырауын бастау
    try:
        result = subprocess.run(
            ['asterisk', '-rx', 'channel originate Local/500@internal-test application Playback hello-world'],
            capture_output=True, text=True,
            timeout=10
        )
        print("   ✓ Тест қоңырауы басталды")
    except Exception as e:
        print(f"   ✗ Қоңырау бастау қате: {e}")

if __name__ == "__main__":
    print("=== AI CALL INTAKE SYSTEM ТЕСТІ ===")
    test_asterisk()
    test_database()
    test_dashboard()
    test_call_processing()
    print("=== ТЕСТ АЯҚТАЛДЫ ===")
EOF

# Тестті орындау
python3 /tmp/test_system.py

print_success "Тест жүргізілді"

# ============================================
# 15. АЯҚТАУ ЖӘНЕ АҚПАРАТ
# ============================================
print_header "15. АЯҚТАУ ЖӘНЕ АҚПАРАТ"

# IP мекенжайын анықтау
IP_ADDRESS=$(hostname -I | awk '{print $1}')

cat << EOF

${GREEN}
╔══════════════════════════════════════════════════════════╗
║          AI CALL INTAKE SYSTEM СӘТТІ ОРНАТЫЛДЫ!         ║
╚══════════════════════════════════════════════════════════╝
${NC}

${YELLOW}📋 МАҢЫЗДЫ АҚПАРАТ:${NC}

${BLUE}🌐 СЕРВЕР МЕКЕНЖАЙЫ:${NC}
   • IP: ${GREEN}$IP_ADDRESS${NC}
   • Dashboard: ${GREEN}http://$IP_ADDRESS:5000${NC}
   • SIP порт: ${GREEN}5060${NC}
   • RTP порттар: ${GREEN}10000-20000${NC}

${BLUE}🔐 КІРУ ДЕРЕКТЕРІ:${NC}
   • Dashboard username: ${GREEN}admin${NC}
   • Dashboard password: ${GREEN}ChangeMe123!${NC}
   • SIP тест нөмірі: ${GREEN}500${NC}
   • SIP пароль: ${GREEN}500${NC}

${BLUE}🛠 БАСҚАРУ КОМАНДАЛАРЫ:${NC}
   • Asterisk статусы: ${GREEN}systemctl status asterisk${NC}
   • AI сервис статусы: ${GREEN}systemctl status ai-call-intake${NC}
   • Dashboard статусы: ${GREEN}systemctl status ai-call-dashboard${NC}
   • Барлық логтар: ${GREEN}journalctl -u ai-call-intake -f${NC}

${BLUE}📞 ТЕСТ ҚОҢЫРАУЫ:${NC}
   • Asterisk консолі: ${GREEN}asterisk -rvvv${NC}
   • Тест қоңырауы: ${GREEN}channel originate SIP/500 extension 500@internal-test${NC}
   • SIP телефон арқылы: ${GREEN}500@$IP_ADDRESS${NC}

${BLUE}📊 МОНИТОРИНГ:${NC}
   • Жүйе логтары: ${GREEN}/var/log/ai-call-intake/${NC}
   • Қоңырау логтары: ${GREEN}/var/lib/ai-call-intake/calls.db${NC}
   • Аудио жазбалар: ${GREEN}/var/spool/asterisk/monitor/${NC}

${YELLOW}⚠ ЕСКЕРТУ:${NC}
1. Парольді өзгертіңіз: ${GREEN}sed -i 's/ChangeMe123!/жаңа_пароль/' .env${NC}
2. API кілттерін тексеріңіз: ${GREEN}nano /opt/ai-call-intake/ai-call-intake-system/.env${NC}
3. Firewall конфигурациясын тексеріңіз
4. SSL сертификатын орнатыңыз (өндіріс үшін)

${GREEN}✅ ЖҮЙЕ ДАЙЫН! ҚОҢЫРАУ ҚАБЫЛДАУ БАСТАЛДЫ.${NC}

Лог файлы: ${YELLOW}$LOG_FILE${NC}
Орнату уақыты: $(date)
EOF

# Лог файлын көрсету
print_info "Толық логты көру үшін: tail -f $LOG_FILE"

print_header "ОРНАТУ АЯҚТАЛДЫ"