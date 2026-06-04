"""
Mock 学生遥测数据生成器

行为模型（100 条事件分布）:
- 20% terminal 含 ERROR
- 20% terminal SQL 成功
- 20% error 带代码 + 诊断
- 10% error 带代码（终端报错快照）
- 15% terminal 其他输出
- 15% idle
"""

import random
import time
import json

SQL_SAMPLES = [
    "CREATE TABLE students (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL);",
    "SELECT * FROM students;",
    "INSERT INTO students (name, age) VALUES ('张三', 20);",
    "ALTER TABLE students ADD COLUMN score INTEGER;",
    "DROP TABLE students;",
    "CREATE TABLE courses (id SERIAL PRIMARY KEY, title VARCHAR(100));",
]

SQL_ERRORS = [
    "ERROR: syntax error at or near 'CREATE'",
    "ERROR: relation 'students' does not exist",
    "ERROR: column 'name' of relation 'students' does not exist",
    "ERROR: duplicate key value violates unique constraint",
    "ERROR: null value in column 'name' violates not-null constraint",
    "psql: error: connection to server on socket ... 致命错误",
]

BAD_SQL_SAMPLES = [
    "SELECT * FORM students",
    "CREATE TABLE students (id SERIAL PRIMARY KEY, name VARCHAR(50));\n  -- 漏了 NOT NULL",
    "CREATE TABLE students (id AUTO_INCREMENT, name TEXT);",
    "SELECT * FROM students WHERE age =",
    "UPDATE students SET name = '张三' WHERE id =",
]

DIAG_ERRORS = [
    {"line": 3, "message": "'FORM' is not recognized (did you mean 'FROM'?)"},
    {"line": 1, "message": "syntax error at or near 'AUTO_INCREMENT'"},
    {"line": 2, "message": "expected 'NOT NULL' but found ')'"},
    {"line": 4, "message": "incomplete input: unexpected end of file"},
    {"line": 2, "message": "column 'score' referenced in ALTER TABLE but not in CREATE TABLE"},
]


def pick_errors():
    return random.sample(DIAG_ERRORS, k=random.randint(1, 3))


def generate_student_batch(student_id: str, count: int = 40, base_time: float | None = None) -> list[dict]:
    """为单个学生生成 count 条遥测事件"""
    now = base_time or time.time()
    events = []
    types = (
        ["terminal_error"] * 20 +
        ["terminal_success"] * 20 +
        ["error_with_diag"] * 20 +
        ["error_snapshot"] * 10 +
        ["terminal_other"] * 15 +
        ["idle"] * 15
    )
    chosen = random.choices(types, k=count)

    for i, t in enumerate(chosen):
        ts = now + i * random.uniform(0.5, 3.0)
        if t == "terminal_error":
            events.append({
                "type": "terminal",
                "timestamp": ts,
                "payload": {"output": random.choice(SQL_ERRORS)},
            })
        elif t == "terminal_success":
            events.append({
                "type": "terminal",
                "timestamp": ts,
                "payload": {"output": random.choice(SQL_SAMPLES)},
            })
        elif t == "error_with_diag":
            bad = random.choice(BAD_SQL_SAMPLES)
            events.append({
                "type": "error",
                "timestamp": ts,
                "payload": {
                    "source": "diagnostics",
                    "code": bad,
                    "codeHistory": [
                        {"text": bad, "timestamp": ts - 30},
                    ],
                    "errors": pick_errors(),
                },
            })
        elif t == "error_snapshot":
            code = random.choice(SQL_SAMPLES)
            events.append({
                "type": "error",
                "timestamp": ts,
                "payload": {
                    "code": code,
                    "codeHistory": [
                        {"text": code, "timestamp": ts - 60},
                    ],
                },
            })
        elif t == "terminal_other":
            events.append({
                "type": "terminal",
                "timestamp": ts,
                "payload": {"output": f"psql ({random.randint(10,16)}.{random.randint(0,5)}) 输入 \"help\" 获取帮助信息."},
            })
        elif t == "idle":
            events.append({
                "type": "idle",
                "timestamp": ts,
                "payload": {"duration": random.uniform(180, 600)},
            })
    return events


def generate_multi_student(n_students: int, events_per_student: int) -> dict[str, list[dict]]:
    """生成多学生的数据集"""
    base = time.time()
    return {
        f"2024{1000 + i:03d}": generate_student_batch(
            f"2024{1000 + i:03d}", events_per_student, base + i * 300
        )
        for i in range(n_students)
    }
