# API Specification

## Base URL

- Backend: `http://localhost:3000/api`
- AI Module: `http://localhost:8001`

## Authentication

### Login

**POST /auth/login**

Request body:

```json
{
  "email": "operator@example.com",
  "password": "password"
}
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "operator@example.com",
    "name": "Operator Name",
    "roles": ["operator"]
  }
}
```

### Register (Admin only)

**POST /auth/register**

### Refresh Token

**POST /auth/refresh**

## Cases

### Get Cases

**GET /cases**

Query parameters:

- `status` (optional): pending, in_progress, resolved, rejected
- `priority` (optional): low, medium, high
- `page` (optional): default 1
- `limit` (optional): default 20

### Create Case

**POST /cases**

Request body:

```json
{
  "callerPhone": "+77001234567",
  "callerName": "Иван Иванов",
  "location": "ул. Абая, 1",
  "audioFileUrl": "http://minio/audio/123.wav",
  "language": "ru"
}
```

### Get Case by ID

**GET /cases/:id**

### Update Case

**PATCH /cases/:id**

### Delete Case

**DELETE /cases/:id** (Admin only)

## AI Module

### Transcribe Audio

**POST /ai/transcribe**

Form-data:

- `file`: audio file (wav, mp3, ogg)
- `language`: ru, kk, en (default ru)

Response:

```json
{
  "text": "Транскрибированный текст...",
  "language": "ru"
}
```

### Classify Text

**POST /ai/classify**

Request body:

```json
{
  "text": "Гражданин жалуется на шум ночью после 23:00."
}
```

Response:

```json
{
  "text": "Гражданин жалуется на шум ночью после 23:00.",
  "language": "ru",
  "categories": ["шум", "жалоба"],
  "priority": "medium",
  "confidence": 0.85
}
```

## Organizations

### List Organizations

**GET /organizations**

### Get Organization

**GET /organizations/:id**

### Create Organization (Admin)

**POST /organizations**

### Update Organization

**PATCH /organizations/:id**

## Users

### Get Users (Admin)

**GET /users**

### Get User Profile

**GET /users/profile**

### Update User

**PATCH /users/:id**

## Analytics

### Dashboard Stats

**GET /analytics/dashboard**

Response:

```json
{
  "totalCases": 1250,
  "pending": 45,
  "resolved": 980,
  "highPriority": 120,
  "avgResponseTime": "2h 15m",
  "topCategories": [
    { "name": "шум", "count": 300 },
    { "name": "драка", "count": 150 }
  ]
}
```

### Heatmap Data

**GET /analytics/heatmap?startDate=2025-01-01&endDate=2025-12-31**

## WebSocket

### Real-time Notifications

**WS /ws**

Events:

- `case_created`
- `case_updated`
- `notification`

## Integration Endpoints

### Send to Organization

**POST /integrations/send/:orgId**

### Check Status

**GET /integrations/status/:caseId**
