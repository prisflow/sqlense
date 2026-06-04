from pydantic_ai import Agent
from pydantic_ai.usage import UsageLimits
from agents.models import BatchFilterResult
from config import get_llm_config

_batch_agent: Agent | None = None


def get_batch_agent() -> Agent:
    global _batch_agent
    if _batch_agent is None:
        cfg = get_llm_config()
        model = f"openai:{cfg.get('model') or 'deepseek-chat'}"
        _batch_agent = Agent(
            model,
            retries=3,
            system_prompt=(
                "你是一个课堂监控数据过滤器。"
                "你会收到一批学生最近一段时间的遥测数据，判断哪些学生需要进一步分析。\n\n"
                "需要分析的学生特征：\n"
                "- 代码有语法错误（diagnostics 类型的错误）\n"
                "- 终端执行 SQL 报错（terminal 中包含 ERROR 或 syntax error）\n"
                "- 反复出错超过 3 次\n"
                "- 代码内容偏离任务要求\n"
                "- 卡在同一段代码上反复修改\n\n"
                "不需要分析的情况：\n"
                "- 只有 idle 事件\n"
                "- 正常编辑无报错且无 terminal 输出\n"
                "- SQL 执行成功\n"
                "- 只有 terminal 成功查询输出\n\n"
                "只返回需要进一步分析的学生 ID，不要返回不需要的学生。"
            ),
            output_type=BatchFilterResult,
        )
    return _batch_agent


async def filter_batch(entries: list[dict]) -> BatchFilterResult:
    parts = []
    for e in entries:
        sid = e.get("student_id", "?")
        telemetry = e.get("telemetry", [])
        lines = [f"  [{t.get('type')}] {str(t.get('payload', {}))[:200]}" for t in telemetry[-15:]]
        parts.append(f"学生 {sid} ({len(telemetry)} 条事件):\n" + "\n".join(lines))

    prompt = "以下是多名学生的遥测数据，判断哪些需要进一步分析：\n\n" + "\n\n".join(parts)
    result = await get_batch_agent().run(prompt, usage_limits=UsageLimits(request_limit=None))
    print(f"[usage] Batch agent: {result.usage.requests} requests")
    return result.output
