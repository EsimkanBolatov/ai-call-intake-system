@echo off
echo ========================================
echo    AI CALL INTAKE SYSTEM - WINDOWS
echo ========================================
echo.

REM Проверка Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker не установлен или не запущен.
    echo Установите Docker Desktop и запустите его.
    echo Скачайте: https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe
    pause
    exit /b 1
)

echo ✅ Docker установлен

REM Проверка запущен ли Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Docker Desktop не запущен.
    echo Запустите Docker Desktop и попробуйте снова.
    pause
    exit /b 1
)

echo ✅ Docker Desktop запущен

REM Сборка и запуск контейнеров
echo.
echo 🚀 Запуск AI Call Intake System...
echo.

REM Удаляем старые контейнеры если есть
docker-compose -f docker-compose-local.yml down

REM Запускаем систему
docker-compose -f docker-compose-local.yml up -d

if errorlevel 1 (
    echo ❌ Ошибка при запуске контейнеров.
    echo Проверьте конфигурацию Docker.
    pause
    exit /b 1
)

echo.
echo ✅ Система успешно запущена!
echo.
echo 📊 ДОСТУПНЫЕ СЕРВИСЫ:
echo   1. Dashboard: http://localhost:5000
echo      Логин: admin
echo      Пароль: ChangeMe123!
echo.
echo   2. API Backend: http://localhost:8000
echo.
echo   3. Asterisk SIP: localhost:5060
echo      Тестовый номер: 500
echo      Пароль: 500
echo.
echo 📞 ТЕСТИРОВАНИЕ:
echo   - Откройте Dashboard и нажмите "Тестовый звонок"
echo   - Или используйте команду:
echo     docker exec ai-call-local-asterisk asterisk -rx "channel originate Local/500@internal-test"
echo.
echo ⚠️  ДЛЯ НАСТРОЙКИ ZADARMA:
echo   - Запустите: setup_zadarma.sh (в Git Bash или WSL)
echo   - Или следуйте инструкции в ZADARMA_SETUP.md
echo.
echo 🛑 ДЛЯ ОСТАНОВКИ СИСТЕМЫ:
echo   docker-compose -f docker-compose-local.yml down
echo.
pause