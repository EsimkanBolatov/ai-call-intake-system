@echo off
echo Запуск Docker Desktop...
echo.

REM Проверяем, запущен ли уже Docker
docker info >nul 2>&1
if not errorlevel 1 (
    echo ✅ Docker Desktop уже запущен.
    goto :start_system
)

echo ⚠️  Docker Desktop не запущен.
echo Запускаем Docker Desktop...

REM Пробуем запустить Docker Desktop
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo Ожидаем запуска Docker Desktop (≈30 секунд)...
timeout /t 30 /nobreak >nul

REM Проверяем снова
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Desktop не запустился.
    echo Пожалуйста, запустите Docker Desktop вручную из меню Пуск.
    echo Затем запустите start_windows.bat
    pause
    exit /b 1
)

echo ✅ Docker Desktop успешно запущен!

:start_system
echo.
echo 🚀 Запуск AI Call Intake System...
echo.

REM Запускаем систему
docker-compose -f docker-compose-local.yml down
docker-compose -f docker-compose-local.yml up -d

if errorlevel 1 (
    echo ❌ Ошибка при запуске системы.
    echo Проверьте конфигурацию.
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
pause