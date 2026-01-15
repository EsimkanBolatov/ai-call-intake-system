# Безопасность и ограничения системы AI-колл-интейк

## 1. Запись звонков

### Политика записи

- Все входящие звонки записываются автоматически
- Формат: WAV (без сжатия для качества)
- Хранение: 30 дней для обычных звонков, 90 дней для критических
- Шифрование: AES-256 для аудиофайлов

### Конфиденциальность

```python
# Пример конфигурации записи
RECORDING_CONFIG = {
    'format': 'wav',
    'max_duration': 300,  # 5 минут
    'storage_path': '/secure/recordings',
    'encryption': {
        'enabled': True,
        'algorithm': 'AES-256',
        'key_rotation_days': 30
    },
    'retention': {
        'normal': 30,  # дней
        'critical': 90,
        'legal_hold': 365  # по требованию
    }
}
```

## 2. Ограничение частоты вызовов (Rate Limiting)

### Защита от злоупотреблений

```python
class RateLimiter:
    """Ограничитель частоты вызовов."""

    def __init__(self):
        self.limits = {
            'per_caller': {
                'calls_per_hour': 5,
                'calls_per_day': 20,
                'block_duration': 3600  # 1 час
            },
            'per_ip': {
                'calls_per_hour': 10,
                'calls_per_day': 50
            },
            'global': {
                'calls_per_minute': 100,
                'calls_per_hour': 1000
            }
        }

    def check_limit(self, caller_id, ip_address):
        """Проверка лимитов для звонящего."""
        # Проверка по caller_id
        caller_calls = self._get_caller_calls(caller_id)
        if caller_calls['hour'] >= self.limits['per_caller']['calls_per_hour']:
            return False, 'caller_hour_limit_exceeded'

        # Проверка по IP
        ip_calls = self._get_ip_calls(ip_address)
        if ip_calls['hour'] >= self.limits['per_ip']['calls_per_hour']:
            return False, 'ip_hour_limit_exceeded'

        # Глобальная проверка
        global_calls = self._get_global_calls()
        if global_calls['minute'] >= self.limits['global']['calls_per_minute']:
            return False, 'global_limit_exceeded'

        return True, 'ok'
```

### Черный список

- Номера с подтвержденными ложными вызовами
- Известные номера мошенников
- Номера с историей злоупотреблений

## 3. Защита данных

### Шифрование данных

```yaml
# Конфигурация шифрования
encryption:
  # Данные в покое
  at_rest:
    database: true
    recordings: true
    logs: true

  # Данные в движении
  in_transit:
    sip: TLS 1.3
    api: HTTPS/TLS 1.3
    internal: mTLS

  # Ключи
  key_management:
    provider: HashiCorp Vault
    rotation: автоматически каждые 90 дней
    backup: в отдельном безопасном хранилище
```

### Маскирование конфиденциальных данных

```python
def mask_sensitive_data(text):
    """Маскирование конфиденциальной информации в тексте."""
    patterns = {
        'phone': r'(\+7|8)(\d{3})(\d{3})(\d{2})(\d{2})',
        'iin': r'(\d{3})(\d{3})(\d{3})(\d{3})',
        'card': r'(\d{4})(\d{4})(\d{4})(\d{4})',
        'passport': r'([A-Z]{2}\d{7})'
    }

    masked = text
    for data_type, pattern in patterns.items():
        if data_type == 'phone':
            masked = re.sub(pattern, r'\1***\3**\4', masked)
        elif data_type == 'iin':
            masked = re.sub(pattern, r'\1***\3***', masked)
        elif data_type == 'card':
            masked = re.sub(pattern, r'\1****\3****', masked)
        elif data_type == 'passport':
            masked = re.sub(pattern, r'**\1**', masked)

    return masked
```

## 4. Аутентификация и авторизация

### Доступ к системе

```python
# Ролевая модель доступа
ROLES = {
    'operator': {
        'permissions': ['view_calls', 'export_data', 'add_notes'],
        'dashboard_access': True
    },
    'supervisor': {
        'permissions': ['view_calls', 'export_data', 'manage_users', 'view_statistics'],
        'dashboard_access': True
    },
    'admin': {
        'permissions': ['all'],
        'dashboard_access': True
    },
    'api_client': {
        'permissions': ['api_access'],
        'dashboard_access': False
    }
}

# JWT аутентификация
JWT_CONFIG = {
    'algorithm': 'RS256',
    'access_token_expiry': 900,  # 15 минут
    'refresh_token_expiry': 604800,  # 7 дней
    'issuer': 'ai-call-intake-system'
}
```

## 5. Ограничения ИИ

### Ограничения ответов ИИ

```python
AI_LIMITATIONS = {
    'role': 'assistant_only',
    'prohibited_actions': [
        'give_legal_advice',
        'promise_assistance',
        'make_decisions',
        'express_emotions',
        'request_personal_data'
    ],
    'allowed_questions': [
        'what_happened',
        'where',
        'current_danger',
        'people_involved',
        'weapons_present'
    ],
    'response_style': {
        'formal': True,
        'concise': True,
        'neutral': True,
        'reassuring': False
    }
}
```

### Валидация выходных данных ИИ

```python
def validate_ai_output(ai_response):
    """Валидация выходных данных ИИ."""
    required_fields = ['urgency', 'category', 'address', 'summary']

    # Проверка обязательных полей
    for field in required_fields:
        if field not in ai_response:
            raise ValidationError(f"Missing required field: {field}")

    # Проверка допустимых значений
    if ai_response['urgency'] not in ['critical', 'high', 'medium', 'low']:
        raise ValidationError(f"Invalid urgency: {ai_response['urgency']}")

    # Проверка на запрещенный контент
    prohibited_content = ['kill', 'bomb', 'terror', 'suicide']
    summary = ai_response['summary'].lower()
    for word in prohibited_content:
        if word in summary:
            raise SecurityError(f"Prohibited content detected: {word}")

    return True
```

## 6. Мониторинг и аудит

### Логирование безопасности

```python
SECURITY_LOGS = {
    'events_to_log': [
        'call_received',
        'call_processed',
        'ai_analysis',
        'data_access',
        'user_login',
        'configuration_change',
        'security_alert'
    ],
    'retention': {
        'security_logs': 365,  # дней
        'audit_logs': 730  # 2 года
    },
    'alerting': {
        'failed_logins': 5,
        'rate_limit_exceeded': True,
        'sensitive_data_detected': True,
        'ai_validation_failed': True
    }
}
```

### SIEM интеграция

- Отправка логов в Splunk/ELK
- Интеграция с SOC
- Автоматические алерты

## 7. Сетевая безопасность

### Конфигурация сети

```yaml
network_security:
  # Брандмауэр
  firewall:
    allowed_ports: [5060, 5061, 80, 443, 5000]
    source_restriction: "internal_networks_only"
    ddos_protection: "cloudflare"

  # Сегментация сети
  network_segmentation:
    telephony_vlan: "VLAN 100"
    application_vlan: "VLAN 200"
    database_vlan: "VLAN 300"
    management_vlan: "VLAN 400"

  # VPN доступ
  vpn:
    required_for_admin: true
    mfa_required: true
    audit_logging: true
```

## 8. Резервное копирование и восстановление

### Политика резервного копирования

```python
BACKUP_CONFIG = {
    'frequency': {
        'database': 'hourly',
        'recordings': 'daily',
        'configurations': 'daily',
        'logs': 'daily'
    },
    'retention': {
        'hourly': 24,
        'daily': 7,
        'weekly': 4,
        'monthly': 12
    },
    'storage': {
        'local': '/backups/local',
        'remote': 's3://backups-encrypted',
        'offsite': 'tape_archive'
    },
    'encryption': {
        'enabled': True,
        'algorithm': 'AES-256-GCM'
    }
}
```

### Восстановление после сбоя

```python
DISASTER_RECOVERY = {
    'rto': '4 hours',  # Recovery Time Objective
    'rpo': '1 hour',   # Recovery Point Objective
    'procedures': [
        'restore_database',
        'restore_recordings',
        'verify_integrity',
        'test_functionality'
    ],
    'testing': {
        'frequency': 'quarterly',
        'last_test': '2025-12-01',
        'success_rate': '100%'
    }
}
```

## 9. Соответствие требованиям

### Нормативные требования

- **Закон о персональных данных РК**: Согласие на обработку, уведомление регулятора
- **Требования МВД**: Хранение записей 30+ дней, доступ по запросу
- **GDPR**: Для международных звонков
- **PCI DSS**: Если обрабатываются платежные данные

### Документация соответствия

- Политика конфиденциальности
- Соглашение об обработке данных
- Процедуры реагирования на инциденты
- Отчеты аудита безопасности

## 10. Тестирование безопасности

### Регулярные проверки

```python
SECURITY_TESTING = {
    'penetration_testing': {
        'frequency': 'quarterly',
        'scope': ['api', 'web', 'telephony'],
        'remediation_time': '30 days'
    },
    'vulnerability_scanning': {
        'frequency': 'weekly',
        'tools': ['Nessus', 'OpenVAS'],
        'critical_fix_time': '7 days'
    },
    'code_review': {
        'frequency': 'per_commit',
        'tools': ['SonarQube', 'Bandit'],
        'security_gates': True
    }
}
```

## 11. Ограничения системы

### Технические ограничения

```python
SYSTEM_LIMITS = {
    'concurrent_calls': 50,  # одновременных звонков
    'processing_time': 30,   # секунд на обработку
    'storage_capacity': '1TB',
    'api_rate_limit': '1000 req/hour',
    'max_call_duration': 300  # 5 минут
}
```

### Операционные ограничения

- Рабочее время: 24/7
- Время ответа: < 2 секунд
- Доступность: 99.9%
- Поддержка языков: русский, казахский, английский

## 12. План реагирования на инциденты

### Шаги при обнаружении угрозы

1. **Идентификация**: Определить тип и масштаб инцидента
2. **Сдерживание**: Изолировать затронутые системы
3. **Ликвидация**: Устранить причину инцидента
4. **Восстановление**: Вернуть систему в рабочее состояние
5. **Анализ**: Изучить причины и предотвратить повторение

### Контакты для экстренных случаев

- Техническая поддержка: +7 (XXX) XXX-XX-XX
- Безопасность: security@example.com
- Юридический отдел: legal@example.com
- Регуляторные органы: МВД РК
