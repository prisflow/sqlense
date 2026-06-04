import os
import time
import asyncpg
from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits
from agents.models import CodeAnalysis, SQLAgentResult, AgentDiagnosis
from config import get_llm_config, PG_DSN

_judge_agent: Agent | None = None
_task_context_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 300


class JudgeContext:
    def __init__(self, pg_dsn: str):
        self.pg_dsn = pg_dsn


def get_judge_agent() -> Agent:
    global _judge_agent
    if _judge_agent is None:
        cfg = get_llm_config()
        model = f"openai:{cfg.get('model') or 'deepseek-chat'}"

        agent = Agent(
            model,
            retries=3,
            system_prompt=(
                "你是一个数据库实验教学系统的主判断智能体。"
                "你会收到代码分析和 SQL 终端分析的结果，以及学生遥测数据。"
                "你有 get_task_context 工具，可以查询学生当前任务的描述和已上传的文档内容。"
                "综合所有信息，判断学生当前的问题优先级和诊断建议。\n\n"
                "优先级规则：\n"
                "- critical: 有语法错误未解决 + 反复失败 + 卡住无进展，需要教师立即介入\n"
                "- high: 有语法错误、表结构严重不符合要求、多次报错\n"
                "- medium: 代码接近完成但有细节问题、进度 50-80%\n"
                "- low: 代码基本正确、进度 80% 以上\n\n"
                "needs_teacher: 根据严重程度判断是否需要教师介入\n"
                "suggested_action: none（无需操作）| notify（通知教师）| popup（主动弹出面板）\n"
                "issues: 列出具体问题列表"
            ),
            deps_type=JudgeContext,
            output_type=AgentDiagnosis,
        )

        @agent.tool
        async def get_task_context(ctx: RunContext[JudgeContext], student_id: str) -> str:
            """查询学生当前任务的描述和已上传的文档内容，用于和学生的完成情况进行对比。"""
            cached = _task_context_cache.get(student_id)
            if cached and time.time() - cached[1] < CACHE_TTL:
                return cached[0]

            conn = await asyncpg.connect(ctx.deps.pg_dsn, timeout=3)
            try:
                task_row = await conn.fetchrow(
                    "SELECT description FROM system.tasks ORDER BY created_at DESC LIMIT 1"
                )
                if not task_row:
                    return "未找到任务描述"

                result = f"## 任务描述\n{task_row['description']}\n\n"

                class_row = await conn.fetchrow(
                    "SELECT class_id FROM system.students WHERE student_no = $1",
                    student_id,
                )
                if class_row:
                    files = await conn.fetch(
                        "SELECT filename, filepath FROM system.task_files WHERE class_id = $1",
                        class_row["class_id"],
                    )
                    if files:
                        result += "## 上传的文档\n"
                        for f in files:
                            result += f"### {f['filename']}\n"
                            content = _read_file(f["filepath"])
                            if content:
                                result += f"```\n{content[:3000]}\n```\n"

                _task_context_cache[student_id] = (result, time.time())
                return result
            finally:
                await conn.close()

        _judge_agent = agent
    return _judge_agent


def _read_file(filepath: str) -> str | None:
    try:
        if not os.path.exists(filepath):
            return None

        if filepath.lower().endswith(".pdf"):
            cache = filepath + ".txt"
            if os.path.exists(cache):
                with open(cache, "r", encoding="utf-8") as f:
                    return f.read()
            import fitz
            doc = fitz.open(filepath)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            try:
                with open(cache, "w", encoding="utf-8") as f:
                    f.write(text)
            except Exception:
                pass
            return text

        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return None


async def diagnose(
    code: CodeAnalysis,
    sql: SQLAgentResult,
    student_id: str,
    student_name: str,
    errors_count: int,
    idle_seconds: float,
    attempts: int,
) -> AgentDiagnosis:
    prompt = f"""
## 学生
学生ID: {student_id}
学生姓名: {student_name}

## 代码分析
- 有错误: {code.has_errors}
- 问题: {', '.join(code.issues) if code.issues else '无'}
- 缺失约束: {', '.join(code.missing_constraints) if code.missing_constraints else '无'}
- 与任务差距: {code.task_deviation}

## SQL 终端分析
- 执行的 SQL: {', '.join(sql.executed_commands) if sql.executed_commands else '无'}
- 报错: {', '.join(sql.errors) if sql.errors else '无'}
- 最后报错: {sql.last_error or '无'}
- 数据库表: {len(sql.db_tables)} 个
- 不匹配: {', '.join(sql.mismatches) if sql.mismatches else '无'}

## 遥测数据
- 错误次数: {errors_count}
- 空闲秒数: {idle_seconds:.0f}
- 尝试次数: {attempts}

你可以调用 get_task_context 工具查询任务文档来对比学生完成情况。
"""
    result = await get_judge_agent().run(prompt, deps=JudgeContext(pg_dsn=PG_DSN), usage_limits=UsageLimits(request_limit=None))
    print(f"[usage] Judge: {result.usage.requests} requests")
    return result.output
