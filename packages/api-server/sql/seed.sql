-- 预设数据
-- 默认账号: admin/admin, teacher/teacher, 2024001/stu2024001

INSERT INTO system.users (username, password_hash, role, display_name) VALUES
('admin', '$2a$10$BObCQaEAMdO24TSPzg2koeDBSQnUHGIz.VduLFfVPKKTOpbN3JA8W', 'admin', '管理员'),
('teacher', '$2a$10$wr8Q7j3RQFJ6g7PxPDHHDeIaBWcsx.WMKr4SjLXE09wg4B5OGraA2', 'teacher', '教师'),
('2024001', '$2a$10$pq81SwjQTFB2lcyfAVjGqO0E4ze5XCdmVBBfVyXXbgBLctyyewHAW', 'student', '张三')
ON CONFLICT (username) DO NOTHING;

INSERT INTO system.classes (id, name, teacher_id) VALUES
('9d460af8-4352-46af-9673-ab959c51adbe', '数据库实验一班', (SELECT id FROM system.users WHERE username='teacher'))
ON CONFLICT (id) DO UPDATE SET teacher_id = (SELECT id FROM system.users WHERE username='teacher');

-- 学生数据库和角色名对应 code-server init.sh 中的 sqltools 连接配置
INSERT INTO system.students (user_id, class_id, student_no, pg_db_name, pg_role_name, cs_port, cs_password, status) VALUES
((SELECT id FROM system.users WHERE username='2024001'), '9d460af8-4352-46af-9673-ab959c51adbe', '2024001', 'db_student_2024001', 'role_student_2024001', 8443, 'stu2024001', 'active')
ON CONFLICT (student_no) DO NOTHING;

-- 为预设学生创建 PostgreSQL 角色（CREATE ROLE 可以在函数中执行）
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT student_no, pg_db_name, pg_role_name, cs_password FROM system.students WHERE status = 'active'
  LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = rec.pg_role_name) THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', rec.pg_role_name, rec.cs_password);
    END IF;
  END LOOP;
END
$$;
