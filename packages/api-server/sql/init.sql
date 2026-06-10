-- 系统数据库 Schema
-- 所有表位于 system schema 下

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS system;

-- 用户表：admin / teacher / student 三类角色
CREATE TABLE system.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    display_name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 班级表：可指定班主任（教师）
CREATE TABLE system.classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    teacher_id UUID REFERENCES system.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 学生表：记录每位学生的数据库、容器端口、状态
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

-- 系统设置：key-value 配置（如日志保留天数）
CREATE TABLE IF NOT EXISTS system.settings (
    key VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system.settings (key, value) VALUES ('log_retention_days', '90') ON CONFLICT (key) DO NOTHING;

-- 教师共享的任务文件：按班级和任务分组管理
CREATE TABLE system.task_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES system.classes(id),
    task_group VARCHAR(128) NOT NULL,
    filename VARCHAR(256) NOT NULL,
    filepath VARCHAR(512) NOT NULL,
    filesize INTEGER NOT NULL,
    mime VARCHAR(128) DEFAULT 'application/octet-stream',
    uploaded_by UUID REFERENCES system.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 操作审计日志
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

-- 索引
CREATE INDEX idx_audit_logs_created_at ON system.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON system.audit_logs(action);
CREATE INDEX idx_task_files_class ON system.task_files(class_id, task_group);
