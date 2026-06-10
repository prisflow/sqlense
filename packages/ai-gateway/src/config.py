import os
import asyncpg

PG_DSN = os.getenv(
    "PG_DSN",
    "postgresql://sqlense:sqlense@postgres:5432/sqlense",
)

# 内存缓存，load_llm_config() 填充后被 get_llm_config() 读取
_llm_config: dict[str, str | None] = {
    "api_key": None,
    "base_url": None,
    "model": None,
}


# 从数据库加载 LLM 配置
async def load_llm_config() -> dict[str, str | None]:
    """从 DB `system.settings` 表加载 LLM 配置，缺失则回退到环境变量。

    设置 OPENAI_API_KEY 和 OPENAI_BASE_URL 环境变量供 pydantic-ai SDK 使用。
    如果 key 为空或为 'sk-placeholder'，标记为 None 以禁用 LLM 功能。
    """
    try:
        conn = await asyncpg.connect(PG_DSN, timeout=3)
        rows = await conn.fetch(
            "SELECT key, value FROM system.settings WHERE key = ANY($1)",
            [["llm_api_key", "llm_base_url", "llm_model"]],
        )
        await conn.close()
        for row in rows:
            _llm_config[row["key"]] = row["value"]
    except Exception as e:
        print(f"[config] DB load failed, falling back to env: {e}")

    _llm_config["api_key"] = _llm_config.get("llm_api_key") or os.getenv("LLM_API_KEY")
    _llm_config["base_url"] = _llm_config.get("llm_base_url") or os.getenv("LLM_BASE_URL")
    _llm_config["model"] = _llm_config.get("llm_model") or os.getenv("LLM_MODEL")

    api_key = _llm_config["api_key"] or ""
    base_url = _llm_config.get("base_url") or os.getenv("OPENAI_BASE_URL") or ""
    if not api_key or api_key == "sk-placeholder":
        _llm_config["api_key"] = None
        print("[config] LLM API key is empty or placeholder, disabling LLM features")
    else:
        os.environ["OPENAI_API_KEY"] = api_key
        if base_url:
            os.environ["OPENAI_BASE_URL"] = base_url.rstrip("/") + "/v1"

    return _llm_config


# 返回缓存的 LLM 配置
def get_llm_config() -> dict[str, str | None]:
    """返回已缓存的 LLM 配置字典。"""
    return _llm_config
