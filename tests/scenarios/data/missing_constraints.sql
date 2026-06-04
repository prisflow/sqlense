-- missing_constraints: 表存在，但缺约束
CREATE TABLE IF NOT EXISTS lab.students (
    id SERIAL,
    name VARCHAR(50),
    age INTEGER,
    email VARCHAR(100),
    enrolled_at DATE
);
-- 缺: PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT
