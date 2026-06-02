CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS system;

CREATE TABLE system.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    display_name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system.classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    teacher_id UUID REFERENCES system.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES system.users(id),
    class_id UUID NOT NULL REFERENCES system.classes(id),
    student_no VARCHAR(32) UNIQUE NOT NULL,
    pg_db_name VARCHAR(128) NOT NULL,
    pg_role_name VARCHAR(128) NOT NULL,
    cs_port INTEGER NOT NULL,
    cs_password VARCHAR(64) NOT NULL,
    status VARCHAR(16) DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'disabled')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(256) NOT NULL,
    description TEXT NOT NULL,
    setup_sql TEXT DEFAULT '',
    checks JSONB NOT NULL DEFAULT '[]',
    score_rules JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES system.students(id),
    task_id UUID NOT NULL REFERENCES system.tasks(id),
    sql_text TEXT NOT NULL,
    score FLOAT DEFAULT 0,
    feedback TEXT DEFAULT '',
    status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system.settings (
    key VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system.settings (key, value) VALUES ('log_retention_days', '90') ON CONFLICT (key) DO NOTHING;

CREATE TABLE system.task_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES system.tasks(id),
    class_id UUID NOT NULL REFERENCES system.classes(id),
    filename VARCHAR(256) NOT NULL,
    filepath VARCHAR(512) NOT NULL,
    filesize INTEGER NOT NULL,
    mime VARCHAR(128) DEFAULT 'application/octet-stream',
    uploaded_by UUID REFERENCES system.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES system.users(id),
    username VARCHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    action VARCHAR(64) NOT NULL,
    detail JSONB DEFAULT '{}',
    ip VARCHAR(45) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created_at ON system.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON system.audit_logs(action);
