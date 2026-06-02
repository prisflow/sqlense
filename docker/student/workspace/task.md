# 数据库实验：创建数据表

## 任务描述
在 PostgreSQL 的 `lab` 模式下创建一张 `students` 表。

## 表结构要求

| 字段名 | 类型 | 约束 |
|--------|------|------|
| id | SERIAL | 主键 |
| name | VARCHAR(50) | NOT NULL |
| age | INTEGER | 无 |
| email | VARCHAR(100) | UNIQUE |
| enrolled_at | DATE | DEFAULT CURRENT_DATE |

## 操作步骤
1. 打开终端 (Ctrl+\`)
2. 连接数据库: `psql -h localhost -U sqlense -d sqldb`
3. 输入密码: `sqlense`
4. 创建表
5. 验证: `\d lab.students`

## 评分标准
- ✅ 表创建成功 (40分)
- ✅ 字段类型正确 (30分)
- ✅ 约束正确 (30分)
