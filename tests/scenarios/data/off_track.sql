-- off_track: 字段名/类型错误，语义不对
CREATE TABLE IF NOT EXISTS lab.students (
    id INT,
    full_name TEXT,
    age INT,
    email TEXT
);
-- 应为 SERIAL → INT, VARCHAR(50) → TEXT, VARCHAR(100) → TEXT
-- 缺: NOT NULL, UNIQUE, PRIMARY KEY, DEFAULT
-- name 列名错误 (应为 name)
