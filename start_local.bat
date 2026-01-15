@echo off
echo Запуск AI Call Intake System локально (без Docker)
echo ================================================

set PROJECT_ROOT=%~dp0
echo PROJECT_ROOT=%PROJECT_ROOT%

echo 1. Проверка зависимостей...
node --version >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Node.js не установлен или не в PATH.
    exit /b 1
)
python --version >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Python не установлен или не в PATH.
    exit /b 1
)

echo 2. Установка зависимостей backend...
cd "%PROJECT_ROOT%backend"
if not exist node_modules (
    echo Установка npm пакетов...
    npm install
) else (
    echo Зависимости backend уже установлены.
)
cd "%PROJECT_ROOT%"

echo 3. Установка зависимостей frontend...
cd "%PROJECT_ROOT%frontend"
if not exist node_modules (
    echo Установка npm пакетов...
    npm install
) else (
    echo Зависимости frontend уже установлены.
)
cd "%PROJECT_ROOT%"

echo 4. Проверка виртуального окружения AI-модуля...
cd "%PROJECT_ROOT%ai-module"
if not exist venv (
    echo Создание виртуального окружения и установка пакетов...
    python -m venv venv
    call venv\Scripts\pip install -r requirements.txt
) else (
    echo Виртуальное окружение уже существует.
)
cd "%PROJECT_ROOT%"

echo 5. Запуск AI-модуля...
start "AI Module" cmd /k "cd /d "%PROJECT_ROOT%ai-module" && venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8001"

timeout /t 5 /nobreak >nul

echo 6. Запуск backend...
start "Backend" cmd /k "cd /d "%PROJECT_ROOT%backend" && npm run start:dev"

timeout /t 10 /nobreak >nul

echo 7. Запуск frontend...
start "Frontend" cmd /k "cd /d "%PROJECT_ROOT%frontend" && npm run dev"

echo ================================================
echo Все компоненты запускаются в отдельных окнах.
echo Проверьте:
echo   - Frontend: http://localhost:5173
echo   - Backend API: http://localhost:3000
echo   - AI Module: http://localhost:8001
echo   - Swagger: http://localhost:3000/api/docs
echo ================================================
pause