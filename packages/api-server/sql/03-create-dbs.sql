-- 为预设学生创建数据库和授权
-- CREATE DATABASE 不能放在 DO 块内，所以用 \gexec 执行动态 SQL
SELECT format('CREATE DATABASE %I OWNER %I', pg_db_name, pg_role_name)
FROM system.students WHERE status = 'active'
AND NOT EXISTS (SELECT FROM pg_database WHERE datname = pg_db_name)
\gexec

SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', pg_db_name, pg_role_name)
FROM system.students WHERE status = 'active'
\gexec
