-- correct: 完整 students 表，全部约束
CREATE TABLE lab.students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    age INTEGER,
    email VARCHAR(100) UNIQUE,
    enrolled_at DATE DEFAULT CURRENT_DATE
);

INSERT INTO lab.students (name, age, email, enrolled_at) VALUES
('张三', 20, 'zhangsan@test.com', '2025-09-01'),
('李四', 22, 'lisi@test.com', '2025-09-01'),
('王五', 21, 'wangwu@test.com', '2025-09-02');
