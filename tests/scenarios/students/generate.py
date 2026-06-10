#!/usr/bin/env python3
"""
生成 30 个测试学生的 telemetry JSON 文件。
每个学生的行为模式是手写定义的，输出确定性的 JSON。

场景分组:
  01-10: correct       — 已完成正确建表，少量正常查询
  11-18: missing_constraints — 建表缺约束，收到 PG 警告
  19-25: not_started    — 未建表，SELECT 报表不存在，反复尝试
  26-30: off_track      — 写错了 SQL，字段名/类型错误，反复失败
"""

import json, os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "students")

BASE_TIME = 1700000000

def t(offset: float) -> float:
    return BASE_TIME + offset

def code_event(code: str, history: list[str] | None = None, source: str | None = None, errors: list | None = None):
    ev = {"type": "error", "timestamp": t(0), "payload": {"code": code}}
    if history:
        ev["payload"]["codeHistory"] = [{"text": h, "timestamp": t(-30 * (len(history)-i))} for i, h in enumerate(history)]
    if source:
        ev["payload"]["source"] = source
    if errors:
        ev["payload"]["errors"] = errors
    return ev

def terminal_event(output: str):
    return {"type": "terminal", "timestamp": t(0), "payload": {"output": output}}

def idle_event(duration: float):
    return {"type": "idle", "timestamp": t(0), "payload": {"duration": duration}}

# ════════════════════════════════════════════════════════════
# 学生 01-10: correct
# 已完成建表，运行正常
# ════════════════════════════════════════════════════════════

CORRECT_TEMPLATE = [
    terminal_event("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='lab' AND table_name='students' ORDER BY ordinal_position;\n column_name | data_type\n-------------+-----------\n id          | integer\n name        | character varying\n age         | integer\n email       | character varying\n enrolled_at | date\n(5 rows)"),
    terminal_event("INSERT INTO lab.students (name, age, email) VALUES ('测试学生', 20, 'test@example.com');\nINSERT 0 1"),
    terminal_event("SELECT * FROM lab.students;\n id |  name  | age |      email       | enrolled_at\n----+--------+-----+------------------+-------------\n  1 | 测试学生 |  20 | test@example.com | 2025-09-01\n(1 row)"),
    idle_event(200),
]

# ════════════════════════════════════════════════════════════
# 学生 11-18: missing_constraints
# 建表了但缺约束，PG 无报错但表结构不完整
# ════════════════════════════════════════════════════════════

MISSING_TEMPLATE = [
    code_event(
        "CREATE TABLE lab.students (id SERIAL, name VARCHAR(50), age INTEGER, email VARCHAR(100), enrolled_at DATE);",
        history=[
            "CREATE TABLE students (id int, name text, age int, email text);",
            "CREATE TABLE lab.students (id SERIAL, name VARCHAR(50), age INTEGER, email VARCHAR(100), enrolled_at DATE);"
        ]
    ),
    terminal_event("CREATE TABLE lab.students (id SERIAL, name VARCHAR(50), age INTEGER, email VARCHAR(100), enrolled_at DATE);\nCREATE TABLE"),
    terminal_event("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='lab' AND table_name='students' ORDER BY ordinal_position;\n column_name | is_nullable | column_default\n-------------+-------------+----------------\n id          | YES         |\n name        | YES         |\n age         | YES         |\n email       | YES         |\n enrolled_at | YES         |\n(5 rows)"),
    idle_event(120),
]

# ════════════════════════════════════════════════════════════
# 学生 19-25: not_started
# 还没建表，反复 SELECT 报表不存在
# ════════════════════════════════════════════════════════════

NOT_STARTED_TEMPLATE = [
    code_event(
        "SELECT * FROM lab.students;",
        history=["SELECT * FROM students;", "SELECT * FROM lab.students;"]
    ),
    terminal_event("SELECT * FROM lab.students;\nERROR: relation 'lab.students' does not exist\nLINE 1: SELECT * FROM lab.students;\n                      ^\nHINT: No schema has been selected to create in\n"),
    terminal_event("SELECT * FROM lab.students;\nERROR: relation 'students' does not exist\nLINE 1: SELECT * FROM students;\n                      ^\n"),
    terminal_event("\\dn\n   List of schemas\n   Name   |  Owner\n----------+---------\n lab      | test_role_N\n public   | testadmin\n(2 rows)"),
    idle_event(300),
]

# ════════════════════════════════════════════════════════════
# 学生 26-30: off_track
# 写错了字段名/类型，反复报错
# ════════════════════════════════════════════════════════════

OFFTRACK_TEMPLATE = [
    code_event(
        "CREATE TABLE lab.students (id INT AUTO_INCREMENT, full_name TEXT NOT NULL, age INT, email TEXT);",
        history=[
            "CREATE TABLE students (id INT AUTO_INCREMENT, name TEXT);",
            "CREATE TABLE lab.students (id INT AUTO_INCREMENT, full_name TEXT NOT NULL, age INT, email TEXT);"
        ],
        source="diagnostics",
        errors=[{"line": 1, "message": "syntax error at or near 'AUTO_INCREMENT'"}]
    ),
    terminal_event("CREATE TABLE lab.students (id INT AUTO_INCREMENT, full_name TEXT NOT NULL, age INT, email TEXT);\nERROR: syntax error at or near 'AUTO_INCREMENT'\nLINE 1: ...CREATE TABLE lab.students (id INT AUTO_INCREMENT...\n                                              ^\nHINT: Use SERIAL instead of AUTO_INCREMENT in PostgreSQL\n"),
    code_event(
        "CREATE TABLE lab.students (id SERIAL, full_name TEXT NOT NULL, age INT, email TEXT);",
        history=["CREATE TABLE lab.students (id SERIAL, full_name TEXT NOT NULL, age INT, email TEXT);"]
    ),
    terminal_event("CREATE TABLE lab.students (id SERIAL, full_name TEXT NOT NULL, age INT, email TEXT);\nCREATE TABLE"),
    terminal_event("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='lab' AND table_name='students' ORDER BY ordinal_position;\n column_name | data_type | is_nullable\n-------------+-----------+-------------\n id          | integer   | YES\n full_name   | text      | NOT NULL\n age         | integer   | YES\n email       | text      | YES\n(4 rows)"),
    idle_event(150),
]

# ── 生成 ──
os.makedirs(OUT, exist_ok=True)

for i in range(1, 31):
    num = f"{i:02d}"
    if i <= 10:
        template = CORRECT_TEMPLATE
        scenario = "correct"
    elif i <= 18:
        template = MISSING_TEMPLATE
        scenario = "missing_constraints"
    elif i <= 25:
        template = NOT_STARTED_TEMPLATE
        scenario = "not_started"
    else:
        template = OFFTRACK_TEMPLATE
        scenario = "off_track"

    data = {
        "student_no": f"test_{num}",
        "scenario": scenario,
        "dsn": f"postgresql://test_role_{num}:stu{num}pass@postgres:5432/test_db_{num}",
        "telemetry": template,
    }

    path = os.path.join(OUT, f"student_{num}.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  {path}")

print("生成完毕")
