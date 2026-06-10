import asyncpg
from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits
from agents.models import SQLAgentResult
from config import get_llm_config

_sql_agent: Agent | None = None


# 预查询数据库结构信息
async def fetch_db_schema(dsn: str) -> str:
    """预查询数据库结构，返回文本摘要。

    在调用 LLM 之前先查询学生的 PG 数据库，获取所有用户表的
    表名 + 字段名 + 类型 + 约束，拼成文本喂给 LLM。
    这样 LLM 不需要通过 execute_query 探索结构，节省 token 和查询次数。

    连接失败时返回错误信息（LLM 会看到并处理）。
    """
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
    except Exception as e:
        return f"数据库连接失败: {e}"

    try:
        # 第一步：查所有非系统 schema 下的表
        # 排除 pg_catalog / information_schema / pg_toast 这些系统 schema
        tables = await conn.fetch(
            "SELECT table_schema, table_name FROM information_schema.tables "
            "WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast') "
            "ORDER BY table_schema, table_name"
        )
        if not tables:
            return "数据库中没有任何表。"

        # 第二步：对每个表查它的字段清单（名称、类型、可空、默认值）
        lines = ["## 数据库结构\n"]
        for t in tables:
            cols = await conn.fetch(
                "SELECT column_name, data_type, is_nullable, column_default "
                "FROM information_schema.columns "
                "WHERE table_schema = $1 AND table_name = $2 "
                "ORDER BY ordinal_position",
                t["table_schema"], t["table_name"],
            )
            # 拼成「字段名 类型 NOT NULL DEFAULT xxx」格式
            col_lines = ",\n  ".join(
                f"{c['column_name']} {c['data_type']}"
                f"{' NOT NULL' if c['is_nullable'] == 'NO' else ''}"
                f"{' DEFAULT ' + c['column_default'] if c['column_default'] else ''}"
                for c in cols
            )
            lines.append(f"  {t['table_schema']}.{t['table_name']} (\n  {col_lines}\n  )")
        return "\n\n".join(lines)
    except Exception as e:
        return f"查询数据库结构失败: {e}"
    finally:
        await conn.close()


# SQL 智能体依赖上下文
class SQLContext:
    """SQL Agent 的依赖上下文，传递 DSN 和查询计数。"""
    def __init__(self, dsn: str):
        self.dsn = dsn
        self.query_count = 0


# 懒初始化 SQL 分析智能体
def get_sql_agent() -> Agent:
    """懒初始化 SQL Agent 单例，注册 execute_query 工具。"""
    global _sql_agent
    if _sql_agent is None:
        cfg = get_llm_config()
        """Agent构造函数要求模型名带provider前缀"""
        model = f"openai:{cfg.get('model') or 'deepseek-chat'}"

        agent = Agent(
            model,
            retries=3,
            system_prompt=(
                "你是一个数据库实验助教，负责分析学生的 SQL 终端输出和数据库状态。"
                "数据库结构已在上方提供，你不需要通过查询来探索数据库结构。"
                "分析学生执行的 SQL 命令是否正确，是否有报错，数据库表结构是否符合要求。"
                "你只分析 SQL 实验相关的编码输出，不需要理解项目背景或业务逻辑。"
                "最多执行 2 次验证性查询即可，不要反复查询。"
            ),
            deps_type=SQLContext,
            output_type=SQLAgentResult,
        )

        @agent.tool
        # 在数据库中执行验证查询
        async def execute_query(ctx: RunContext[SQLContext], sql: str) -> str:
            """在数据库中执行验证性查询（SELECT / information_schema）。
            数据库完整结构已在上方提供，请勿用于探索性查询。
            只做针对性验证即可，最多 2 次。"""
            ctx.deps.query_count += 1
            conn = await asyncpg.connect(ctx.deps.dsn, timeout=5)
            try:
                result = await conn.fetch(sql)
                rows = [str(dict(r)) for r in result[:20]]
                return f"(查询 #{ctx.deps.query_count}/2)\n" + ("\n".join(rows) if rows else "(空结果)")
            except Exception as e:
                return f"(查询 #{ctx.deps.query_count}/2)\nERROR: {e}"
            finally:
                await conn.close()

        _sql_agent = agent
    return _sql_agent


# 分析终端输出和数据库状态
async def analyze_sql(terminal_outputs: list[str], dsn: str) -> SQLAgentResult:
    """执行 SQL 分析。

    流程：
    1. 预查询数据库结构（fetch_db_schema）—— 不用 LLM，纯 SQL
    2. 把终端输出 + 数据库结构拼成 prompt 发给 LLM
    3. LLM 返回 SQLAgentResult（执行命令、错误、不匹配项）

    Args:
        terminal_outputs: 学生最近执行的终端输出列表。
        dsn: 学生数据库 DSN。

    Returns:
        SQLAgentResult: 执行命令、错误、不匹配项列表。
    """
    if not terminal_outputs and not dsn:
        return SQLAgentResult(executed_commands=[], errors=[], last_error=None, db_tables=[], mismatches=[])

    schema_info = ""
    if dsn:
        # 预查：在学生库中查询所有用户表的字段结构
        schema_info = await fetch_db_schema(dsn)

    # 取最近 20 行终端输出
    text = "\n".join(terminal_outputs[-20:]) if terminal_outputs else "(无终端输出)"
    prompt = (
        f"## 终端输出\n```\n{text}\n```\n\n"
        f"## 预查数据库状态\n{schema_info}\n\n"
        "请分析学生执行的 SQL 命令、错误信息，以及数据库当前结构是否符合任务要求。"
        "数据库结构已在上方提供，最多执行 2 次验证性查询。"
    )
    try:
        result = await get_sql_agent().run(prompt, deps=SQLContext(dsn=dsn), usage_limits=UsageLimits(request_limit=None, tool_calls_limit=2))
        print(f"[usage] SQL agent: {result.usage.requests} requests")
        return result.output
    except Exception as e:
        print(f"[usage] SQL agent failed: {e}")
        return SQLAgentResult(executed_commands=[], errors=[], last_error=str(e), db_tables=[], mismatches=[])
