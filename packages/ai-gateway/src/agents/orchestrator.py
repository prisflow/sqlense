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
    """Judge Agent 依赖上下文，持有系统 PG DSN 和工具调用计数。"""
    def __init__(self, pg_dsn: str):
        self.pg_dsn = pg_dsn
        self.task_context_calls = 0


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
                "你有 get_task_context 工具，可以查询教师上传的任务参考资料（不是学生上传的），用于判断学生的完成情况是否符合要求。"
                "综合所有信息，判断学生当前的问题优先级和诊断建议。\n\n"
                "输出字段说明：\n"
                "- progress_pct: 学生任务进度百分比（0-100），根据代码完成度和数据库表结构判断\n"
                "- progress_message: 进度的中文描述（如「已完成基础表结构」、「语法错误卡住中」）\n"
                "- priority: critical / high / medium / low\n"
                "  - critical: 有语法错误未解决 + 反复失败 + 卡住无进展，需要教师立即介入\n"
                "  - high: 有语法错误、表结构严重不符合要求、多次报错\n"
                "  - medium: 代码接近完成但有细节问题、进度 50-80%\n"
                "  - low: 代码基本正确、进度 80% 以上\n"
                "- suggested_action: none（无需操作）| notify（通知教师）| popup（主动弹出面板）\n"
                "- diagnosis: 问题诊断描述\n"
                "- suggestion: 具体修改建议\n"
                "注意：get_task_context 工具最多调用 1 次，不要重复调用。"
            ),
            deps_type=JudgeContext,
            output_type=AgentDiagnosis,
        )
    

        @agent.tool
        async def get_task_context(ctx: RunContext[JudgeContext], student_id: str, task_group: str = "") -> str:
            """查询教师上传的参考资料（任务文档），用于判断学生的完成情况是否符合要求。最多调用 1 次。"""
            if ctx.deps.task_context_calls >= 1:
                return "你已经调用过 get_task_context，结果已在对话中。请基于已有信息直接进行诊断，不要重复调用。"
            ctx.deps.task_context_calls += 1
            cache_key = f"{student_id}:{task_group}"
            cached = _task_context_cache.get(cache_key)
            if cached and time.time() - cached[1] < CACHE_TTL:
                return cached[0]

            result_parts: list[str] = []
            if task_group:
                result_parts.append(f"## 当前任务分组\n{task_group}\n")

            conn = await asyncpg.connect(ctx.deps.pg_dsn, timeout=3)
            try:
                class_row = await conn.fetchrow(
                    "SELECT class_id FROM system.students WHERE student_no = $1",
                    student_id,
                )
                if class_row:
                    if task_group:
                        files = await conn.fetch(
                            "SELECT filename, filepath FROM system.task_files WHERE class_id = $1 AND task_group = $2 ORDER BY created_at",
                            class_row["class_id"], task_group,
                        )
                    else:
                        files = await conn.fetch(
                            "SELECT filename, filepath FROM system.task_files WHERE class_id = $1 ORDER BY created_at",
                            class_row["class_id"],
                        )
                    if files:
                        result_parts.append("## 上传的文档\n")
                        for f in files:
                            result_parts.append(f"### {f['filename']}\n")
                            content = _read_file(f["filepath"])
                            if content:
                                result_parts.append(f"```\n{content[:3000]}\n```\n")

                result = "\n".join(result_parts) or "未找到任务文档"
                print(f"[task_context] files_found={len(files) if files else 0}, preview={result[:20]}")
                _task_context_cache[cache_key] = (result, time.time())
                return result
            finally:
                await conn.close()

        _judge_agent = agent
    return _judge_agent


def _read_file(filepath: str) -> str | None:
    """读取文件内容，支持 PDF 自动提取文本（含本地缓存）。"""
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
    task_group: str,
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

    你可以调用 get_task_context 工具查询教师上传的任务参考资料（最多调用 1 次，不要重复调用）。
"""
    try:
        t0 = time.time()
        result = await get_judge_agent().run(prompt, deps=JudgeContext(pg_dsn=PG_DSN), usage_limits=UsageLimits(request_limit=None, tool_calls_limit=1))
        print(f"[timing] Judge: {time.time()-t0:.1f}s, {result.usage.requests} requests")
        return result.output
    except Exception as e:
        print(f"[timing] Judge failed after {time.time()-t0:.1f}s: {e}")
        return AgentDiagnosis(priority="medium", diagnosis=f"分析中断", suggestion="", progress_pct=0, progress_message="分析异常")
