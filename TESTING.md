# Проверка системы

## 1. Запуск системы

### Вариант A: Docker Compose (рекомендуется)

```bash
cd deployment
docker-compose up -d
```

Дождитесь запуска всех контейнеров (около 1-2 минут). Проверьте статус:

```bash
docker-compose ps
```

Все сервисы должны быть в состоянии `Up`.

### Вариант B: Локальный запуск (для разработки)

Запустите каждый компонент в отдельном терминале:

**Backend:**

```bash
cd backend
npm install
npm run start:dev
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**AI-модуль:**

```bash
cd ai-module
python -m venv venv
# Активируйте venv
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**База данных:**
Убедитесь, что PostgreSQL и Redis запущены (можно использовать docker-compose только для БД).

## 2. Проверка доступности сервисов

Откройте браузер и проверьте:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger UI: http://localhost:3000/api/docs
- AI‑модуль: http://localhost:8001/docs
- MinIO Console: http://localhost:9001 (логин: minioadmin, пароль: minioadmin)

## 3. Тестовые запросы

### Аутентификация

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@system.local","password":"admin123"}'
```

В ответ должен прийти JWT токен.

### Создание обращения (case)

```bash
curl -X POST http://localhost:3000/cases \
  -H "Authorization: Bearer <ваш_токен>" \
  -H "Content-Type: application/json" \
  -d '{
    "callerPhone": "+77001234567",
    "callerName": "Тестовый звонящий",
    "location": "ул. Тестовая, 1",
    "language": "ru"
  }'
```

### Транскрипция аудио (AI‑модуль)

```bash
curl -X POST http://localhost:8001/transcribe \
  -F "file=@test_audio.wav" \
  -F "language=ru"
```

(Предварительно создайте тестовый WAV‑файл или используйте заглушку.)

### Классификация текста

```bash
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"text":"Соседи шумят ночью, не дают спать."}'
```

## 4. Проверка интерфейса

1. Откройте http://localhost:5173
2. Войдите с данными:
   - Email: `admin@system.local`
   - Пароль: `admin123`
3. Убедитесь, что загружается Dashboard с графиками.
4. Перейдите в раздел "Журнал обращений" – должна отображаться таблица (пока пустая или с тестовыми данными).
5. Проверьте боковое меню, заголовок, уведомления.

## 5. Проверка базы данных

Подключитесь к PostgreSQL:

```bash
docker exec -it ai_call_intake_db psql -U postgres -d ai_call_intake
```

Выполните запросы:

```sql
SELECT * FROM users;
SELECT * FROM cases;
SELECT * FROM organizations;
```

## 6. Логи

Просмотрите логи контейнеров для выявления ошибок:

```bash
docker-compose logs backend
docker-compose logs ai-module
docker-compose logs postgres
```

## 7. Интеграционные тесты

Запустите тесты (если они написаны):

**Backend:**

```bash
cd backend
npm test
```

**AI‑модуль:**

```bash
cd ai-module
pytest
```

## 8. Критерии успешной проверки

- [ ] Все сервисы запускаются без ошибок.
- [ ] Frontend загружается, интерфейс отображается.
- [ ] Аутентификация работает (можно получить токен).
- [ ] API endpoints возвращают ожидаемые ответы (200/201).
- [ ] База данных содержит таблицы и seed‑данные.
- [ ] AI‑модуль отвечает на запросы транскрипции и классификации.
- [ ] В логах нет критических ошибок (только предупреждения).

## 9. Устранение неполадок

### Проблема: Контейнеры не запускаются

- Проверьте, что порты 3000, 5173, 8001, 5432, 6379, 9000 не заняты.
- Увеличьте лимиты памяти Docker.

### Проблема: Frontend не подключается к backend

- Убедитесь, что переменные окружения VITE_API_BASE_URL указаны правильно.
- Проверьте CORS настройки в backend.

### Проблема: Ошибки базы данных

- Проверьте, что PostgreSQL контейнер работает и пароли совпадают.
- Выполните init.sql вручную при необходимости.

### Проблема: AI‑модуль не устанавливает зависимости

- Убедитесь, что в requirements.txt корректные версии.
- Проверьте наличие Python 3.11+.

По всем вопросам обращайтесь к документации или команде разработки.
