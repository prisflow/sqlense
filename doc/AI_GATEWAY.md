# AI 网关

## 架构

```
telemetry → WebSocket Server
  ├─ 单生高频(5条/10s) ─→ POST /analyze
  └─ 全局累计 100 条 ──→ POST /batch
                            └─ Batch Agent (LLM 过滤器)
                                ├─ push → POST /analyze
                                └─ clear → 丢弃
```

### /analyze 分析流水线

```
Code Agent ─┐
SQL Agent   ─┤ 异步并行 → Judge → 推教师端
             │
Code Agent: 分析 SQL 代码 + 编辑历史（LLM）
SQL Agent:  合并终端分析 + DB 查询（LLM + execute_query tool）
Judge:      综合判断 + get_task_context 工具查任务文档（LLM + tool）
```

### /batch 过滤流

```
Batch Agent: 收到 100 条 telemetry → LLM 判断哪些学生值得分析
  → push: 有语法错误/终端报错/卡住的学生 → 走 /analyze 流水线
  → clear: 只有 idle/正常编辑 → 直接丢弃
```

## 数据流详解

### 扩展端 → WebSocket 服务器

| 事件类型 | 触发时机 | 核心字段 |
|---------|---------|---------|
| `error` | 终端报错 / 诊断红色波浪线持续 5s+ | `code`, `codeHistory`, `message`/`errors` |
| `terminal` | psql 执行 SQL 命令 | `output` |
| `idle` | 超过 3 分钟无操作 | `duration` |

不再发送 `editor` 类型事件。代码快照只在错误时附带。

### WebSocket 服务器内部

TelemetryTracker 双路调度：

```
record(studentId, data)
  ├─ studentFreq[studentId] 滑动窗口(10s)
  │   └─ ≥5 条 → flushStudent → POST /analyze
  └─ globalCount++
      └─ ≥100 → flushGlobal → POST /batch
```

`idle` 事件跳过 tracker，直接广播给教师端。

### WebSocket 服务器 → AI 网关

`analyzeStudent()` 组装请求：

```json
{
  "student_id": "2024001",
  "student_name": "张三",
  "task_description": "创建 students 表...",
  "student_dsn": "postgresql://role_student_2024001:stu2024001@postgres:5432/db_student_2024001",
  "telemetry": [
    {"type": "error", "payload": {"code": "CREATE TABLE...", "codeHistory": [...]}},
    {"type": "terminal", "payload": {"output": "ERROR: syntax error"}},
    {"type": "error", "payload": {"source": "diagnostics", "errors": [{"line":3, "message":"..."}]}}
  ]
}
```

DSN 通过查询 `system.students` 表构建，使用 `pg_role_name`、`cs_password`、`pg_db_name`。

### AI 网关内部

`POST /analyze` 处理流程：

```
提取 telemetry → 分离 code/diagnostics/terminal/stats
  → if has code: Code Agent.run(code + history + task + diagnostics)
  → if terminal or DSN: SQL Agent.run(terminal + DSN)  
      └─ tool: execute_query(sql) → SELECT / information_schema 只读
  → if code_analysis or sql_analysis: Judge.run(code + sql + stats)
      └─ tool: get_task_context(student_id) → 查 DB + 读文件
  → 返回 AnalyzeResponse
```

`POST /batch` 处理流程：

```
Batch Agent.run(分组的 telemetry entries) → 过滤出需要分析的学生
  → push: 逐个走 /analyze 流水线
  → clear: 直接丢弃
```

### Judge 文档查询工具

```python
get_task_context(student_id) → str
  → asyncpg 连系统 DB
  → 查 system.tasks 最新任务
  → 查 system.students 找到班级
  → 查 system.task_files 找到文件
  → 读文件内容（txt/md 直接读，PDF 用 PyMuPDF 提取 + 缓存 .txt）
  → 返回组合文本
```

无需 RAG、向量库、存储。

## 输出模型

```python
class AgentDiagnosis(BaseModel):
    priority: str            # "critical" | "high" | "medium" | "low"
    diagnosis: str           # 问题描述
    suggestion: str          # 修改建议
    progress_pct: int        # 0-100
    suggested_action: str    # "none" | "notify" | "popup"
    issues: list[Issue]
```

## API

### POST /analyze

请求：`AnalyzeRequest` → 响应：`AnalyzeResponse`

```json
{
  "student_id": "2024001",
  "priority": "critical",
  "progress": {"current_pct": 50, "message": "正在尝试，进展中"},
  "issues": [{"category": "syntax_error", "severity": "error", "message": "..."}],
  "diagnosis": "PRIMARY KEY 约束缺失，SERIAL 语法错误",
  "suggestion": "将 id 字段改为: id SERIAL PRIMARY KEY",
  "suggested_action": "popup"
}
```

### POST /batch

请求：`{ entries: [{ student_id, telemetry: [...] }] }`  
响应：`{ action: "push"|"clear", students: [{ student_id }], reasoning: "..." }`

### GET /config

返回当前 LLM 配置。

## LLM 配置

| 字段 | 来源 | 默认 |
|------|------|------|
| `llm_api_key` | `system.settings` / `LLM_API_KEY` | — |
| `llm_base_url` | `system.settings` / `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `llm_model` | `system.settings` / `LLM_MODEL` | `deepseek-chat` |

未配置时 `/analyze` 返回 503，`/batch` 返回 clear。

## 框架

Pydantic AI (`pydantic-ai-slim`)，所有 Agent 使用 `result_type` 做结构化输出。

- Code Agent / Batch Agent：纯 LLM，无 tool
- SQL Agent：`deps_type=SQLContext` + `execute_query` tool（只读 SELECT）
- Judge：`deps_type=JudgeContext` + `get_task_context` tool（查 DB + 读文件）

## 文件结构

```
packages/ai-gateway/src/
├── main.py                # FastAPI 入口
├── config.py              # LLM 配置加载
├── agents/
│   ├── __init__.py
│   ├── models.py          # Agent 输出模型
│   ├── code_agent.py      # Code Agent（LLM 分析代码 + 编辑历史）
│   ├── sql_agent.py       # SQL Agent（LLM + execute_query tool）
│   ├── orchestrator.py    # Judge（LLM + get_task_context tool）
│   └── batch_agent.py     # Batch 过滤器（LLM）
└── schemas/
    ├── __init__.py
    └── models.py          # API 请求/响应模型
```
