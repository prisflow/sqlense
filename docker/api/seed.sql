INSERT INTO system.users (username, password_hash, role, display_name) VALUES
('admin', '$2a$10$BObCQaEAMdO24TSPzg2koeDBSQnUHGIz.VduLFfVPKKTOpbN3JA8W', 'admin', '管理员'),
('teacher', '$2a$10$wr8Q7j3RQFJ6g7PxPDHHDeIaBWcsx.WMKr4SjLXE09wg4B5OGraA2', 'teacher', '教师'),
('2024001', '$2a$10$pq81SwjQTFB2lcyfAVjGqO0E4ze5XCdmVBBfVyXXbgBLctyyewHAW', 'student', '张三'),
('2024002', '$2a$10$pq81SwjQTFB2lcyfAVjGqO0E4ze5XCdmVBBfVyXXbgBLctyyewHAW', 'student', '李四');

INSERT INTO system.classes (id, name, teacher_id) VALUES
('00000000-0000-0000-0000-000000000001', '数据库实验一班', (SELECT id FROM system.users WHERE username='teacher'))
ON CONFLICT (id) DO UPDATE SET teacher_id = (SELECT id FROM system.users WHERE username='teacher');

INSERT INTO system.students (user_id, class_id, student_no, pg_db_name, pg_role_name, cs_port, cs_password, status) VALUES
((SELECT id FROM system.users WHERE username='2024001'), '00000000-0000-0000-0000-000000000001', '2024001', 'db_student_2024001', 'role_student_2024001', 8443, 'stu2024001', 'active'),
((SELECT id FROM system.users WHERE username='2024002'), '00000000-0000-0000-0000-000000000001', '2024002', 'db_student_2024002', 'role_student_2024002', 8444, 'stu2024002', 'active')
ON CONFLICT (student_no) DO NOTHING;

DO \$\$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT student_no, pg_db_name, pg_role_name, cs_password FROM system.students WHERE status = 'active'
  LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = rec.pg_role_name) THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', rec.pg_role_name, rec.cs_password);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = rec.pg_db_name) THEN
      EXECUTE format('CREATE DATABASE %I OWNER %I', rec.pg_db_name, rec.pg_role_name);
      EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', rec.pg_db_name, rec.pg_role_name);
    END IF;
  END LOOP;
END
\$\$;

INSERT INTO system.tasks (id, title, description, setup_sql, checks, score_rules) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '创建学生表',
    '在 lab 模式下创建 students 表，包含 id(SERIAL PK), name(VARCHAR(50) NOT NULL), age(INTEGER), email(VARCHAR(100) UNIQUE), enrolled_at(DATE DEFAULT CURRENT_DATE)',
    'CREATE SCHEMA IF NOT EXISTS lab;',
    '[{"query":"验证表存在","sql":"SELECT table_name FROM information_schema.tables WHERE table_schema=''lab'' AND table_name=''students''","expected":"students"},{"query":"验证 id 字段","sql":"SELECT data_type FROM information_schema.columns WHERE table_schema=''lab'' AND table_name=''students'' AND column_name=''id''","expected":"integer"},{"query":"验证 name 字段","sql":"SELECT is_nullable FROM information_schema.columns WHERE table_schema=''lab'' AND table_name=''students'' AND column_name=''name''","expected":"NO"}]',
    '{"表存在":40,"id 类型正确":20,"name 非空":20,"约束完整":20}'
)
ON CONFLICT (id) DO NOTHING;
