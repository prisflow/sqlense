import time
from pydantic_ai import Agent
from pydantic_ai.usage import UsageLimits
from agents.models import CodeAnalysis
from config import get_llm_config

_code_agent: Agent | None = None


# 懒初始化代码分析智能体
def get_code_agent() -> Agent:
    """懒初始化 Code Agent 单例。"""
    global _code_agent
    if _code_agent is None:
        cfg = get_llm_config()
        model = f"openai-chat:{cfg.get('model') or 'deepseek-chat'}"
        _code_agent = Agent(
            model,
            retries=3,
            system_prompt=(
                "你是一个数据库实验助教，负责分析学生写的 SQL 代码。"
                "找出语法错误、缺失的约束等编码问题。"
                "你会收到当前代码快照和多段历史快照，可以观察代码的演变过程。"
                "只分析 SQL 编码相关的语法和逻辑问题，不需要理解项目背景或业务逻辑。"
            ),
            output_type=CodeAnalysis,
        )
    return _code_agent


# 分析学生 SQL 代码质量
async def analyze_code(
    code: str,
    diagnostics: list[dict],
    code_history: list[dict] | None = None,
) -> CodeAnalysis:
    """执行代码分析。

    Args:
        code: 当前编辑器中的 SQL 代码。
        diagnostics: VS Code 诊断错误列表。
        code_history: 最近 5 次编辑历史快照。

    Returns:
        CodeAnalysis: 包含错误、缺失约束、任务偏离信息的结构化结果。
    """
    prompt = f"## 当前代码\n```sql\n{code}\n```\n\n"
    if code_history:
        prompt += "## 代码编辑历史\n"
        for h in code_history[-4:]:
            prompt += f"```sql\n{h.get('text', '')}\n```\n\n"
    if diagnostics:
        prompt += "## VS Code 诊断错误\n"
        for d in diagnostics:
            prompt += f"  第 {d.get('line')} 行: {d.get('message')}\n"
    prompt += "\n请分析这段代码哪里有问题。"
    t0 = time.time()
    result = await get_code_agent().run(prompt, usage_limits=UsageLimits(request_limit=None))
    print(f"[timing] Code agent: {time.time()-t0:.1f}s, {result.usage.requests} requests")
    return result.output
