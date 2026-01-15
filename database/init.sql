-- Database: ai_call_intake

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    roles JSONB DEFAULT '["operator"]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(100) NOT NULL, -- police, prosecutor, municipality, etc.
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    region VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(50) UNIQUE NOT NULL,
    caller_phone VARCHAR(20),
    caller_name VARCHAR(255),
    location VARCHAR(500),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    audio_file_url VARCHAR(500),
    transcript TEXT,
    language VARCHAR(10) DEFAULT 'ru',
    categories JSONB DEFAULT '[]',
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, transferred, resolved, rejected
    assigned_to UUID REFERENCES users(id),
    assigned_org UUID REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audio_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id),
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size BIGINT,
    duration_seconds INT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id),
    text TEXT,
    categories JSONB,
    priority VARCHAR(20),
    confidence DECIMAL(5, 4),
    model_version VARCHAR(50),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integrations_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    endpoint VARCHAR(500),
    request_body JSONB,
    response_body JSONB,
    status_code INT,
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_priority ON cases(priority);
CREATE INDEX idx_cases_assigned_org ON cases(assigned_org);
CREATE INDEX idx_case_history_case_id ON case_history(case_id);
CREATE INDEX idx_audio_files_case_id ON audio_files(case_id);

-- Insert default organizations
INSERT INTO organizations (id, name, code, type, region) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Полиция', 'POLICE', 'police', 'Нур-Султан'),
    ('22222222-2222-2222-2222-222222222222', 'Прокуратура', 'PROSECUTOR', 'prosecutor', 'Нур-Султан'),
    ('33333333-3333-3333-3333-333333333333', 'Акимат', 'MUNICIPALITY', 'municipality', 'Нур-Султан'),
    ('44444444-4444-4444-4444-444444444444', 'ТЖК (ЧС)', 'EMERGENCY', 'emergency', 'Нур-Султан')
ON CONFLICT (code) DO NOTHING;

-- Insert admin user (password: admin123)
INSERT INTO users (id, email, password, name, roles, is_active) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@system.local', '$2b$10$ExampleHashNotReal', 'Администратор', '["admin"]', TRUE)
ON CONFLICT (email) DO NOTHING;