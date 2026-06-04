import os
import asyncpg

PG_DSN = os.getenv(
    "PG_DSN",
    "postgresql://sqlense:sqlense@postgres:5432/sqlense",
)

_llm_config: dict[str, str | None] = {
    "api_key": None,
    "base_url": None,
    "model": None,
}

async def load_llm_config() -> dict[str, str | None]:
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


def get_llm_config() -> dict[str, str | None]:
    return _llm_config
