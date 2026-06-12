import asyncio
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    PriorityLevel,
    ProgressMetrics,
    BatchRequest,
    BatchResponse,
    BatchStudent,
)
from config import load_llm_config, get_llm_config


# 确保 LLM 配置可用，如果内存中没有则从 DB 重载
async def _ensure_llm() -> bool:
    cfg = get_llm_config()
    if cfg.get("api_key"):
        return True
    cfg = await load_llm_config()
    return bool(cfg.get("api_key"))
from agents.models import CodeAnalysis, SQLAgentResult
from agents.code_agent import analyze_code
from agents.sql_agent import analyze_sql
from agents.orchestrator import diagnose
from agents.batch_agent import filter_batch

app = FastAPI(title="SQLense AI Gateway", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
# 启动时加载 LLM 配置
async def startup():
    """启动时从 DB/环境变量加载 LLM 配置。"""
    cfg = await load_llm_config()
    has_key = bool(cfg.get("api_key"))
    print(f"[startup] LLM config loaded, API key {'present' if has_key else 'MISSING'}")


@app.get("/health")
# 服务存活探针接口
async def health():
    """K8s / Docker 存活探针。"""
    return {"status": "ok"}


@app.get("/config")
# 返回 LLM 配置脱敏信息
async def config():
    """返回当前 LLM 配置（API key 脱敏）。"""
    cfg = get_llm_config()
    return {
        "api_key": "***" if cfg.get("api_key") else None,
        "base_url": cfg.get("base_url"),
        "model": cfg.get("model"),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
# 核心分析端点
async def analyze(req: AnalyzeRequest):
    """核心分析端点。

    无 LLM 时返回 503，强制部署者配置 LLM。
    有 LLM 时并发调用 Code Agent + SQL Agent → Judge 综合诊断。
    """
    t0 = time.time()
    if not await _ensure_llm():
        raise HTTPException(status_code=503, detail="AI 未配置，请在 system.settings 中配置 LLM_API_KEY")
    print(f"[timing] _ensure_llm: {time.time()-t0:.1f}s")

    # 没有遥测数据时直接跳过分析
    if not req.telemetry:
        return AnalyzeResponse(
            student_id=req.student_id,
            student_name=req.student_name,
            priority=PriorityLevel.LOW,
            progress=ProgressMetrics(current_pct=0, message="暂无学生活动数据"),
        )

    t1 = time.time()
    # 按类型分类遥测条目
    code_text = ""
    code_history: list[dict] = []
    diagnostics_list: list[dict] = []
    terminal_outputs: list[str] = []
    errors_count = 0
    idle_seconds = 0.0
    attempts = 0

    for t in req.telemetry:
        p = t.payload or {}
        if t.type == "error" and p.get("code"):
            code_text = p["code"]
            code_history = p.get("codeHistory", [])
        if t.type == "error" and p.get("source") == "diagnostics":
            for e in (p.get("errors") or []):
                diagnostics_list.append(e)
        if t.type == "error" and p.get("source") == "sqltools" and p.get("message"):
            terminal_outputs.append(p["message"])
        if t.type == "error":
            errors_count += 1
        if t.type == "error" and p.get("source") == "sqltools":
            attempts += 1
        if t.type == "idle":
            idle_seconds += p.get("duration", 0)
    print(f"[timing] classify telemetry: {time.time()-t1:.1f}s")

    t2 = time.time()
    # 并发调用 Code Agent + SQL Agent
    coros = []
    if code_text:
        coros.append(analyze_code(code_text, diagnostics=diagnostics_list, code_history=code_history))
    coros.append(analyze_sql(terminal_outputs, req.student_dsn or ""))

    results = await asyncio.gather(*coros)
    print(f"[timing] Code+SQL agents: {time.time()-t2:.1f}s")
    idx = 0
    code_analysis = results[idx] if code_text else CodeAnalysis(has_errors=False, issues=[], missing_constraints=[])
    if code_text:
        idx += 1
    sql_analysis = results[idx]

    t3 = time.time()
    # Judge 综合诊断
    agent_diagnosis = await diagnose(
        code=code_analysis or CodeAnalysis(has_errors=False, issues=[], missing_constraints=[]),
        sql=sql_analysis or SQLAgentResult(executed_commands=[], errors=[], last_error=None, db_tables=[], mismatches=[]),
        student_id=req.student_id,
        student_name=req.student_name,
        task_group=req.task_group,
        errors_count=errors_count,
        idle_seconds=idle_seconds,
        attempts=attempts,
    )
    print(f"[timing] Judge: {time.time()-t3:.1f}s")
    print(f"[timing] TOTAL: {time.time()-t0:.1f}s")

    # 组装响应
    return AnalyzeResponse(
        student_id=req.student_id,
        student_name=req.student_name,
        priority=_map_priority(agent_diagnosis.priority),
        progress=ProgressMetrics(
            current_pct=agent_diagnosis.progress_pct / 100,
            message=agent_diagnosis.progress_message or agent_diagnosis.diagnosis,
        ),
        diagnosis=agent_diagnosis.diagnosis,
        suggestion=agent_diagnosis.suggestion,
        suggested_action=agent_diagnosis.suggested_action,
    )


@app.post("/batch", response_model=BatchResponse)
# 批量过滤端点
async def batch_analyze(req: BatchRequest):
    """批量过滤端点。

    将多名学生的 telemetry 聚合后交给 Batch Agent，
    LLM 判断哪些学生需要进一步分析。
    无 LLM 时返回 503。
    """
    if not await _ensure_llm():
        raise HTTPException(status_code=503, detail="AI 未配置，请在 system.settings 中配置 LLM_API_KEY")

    entries = [e.model_dump() for e in req.entries]
    result = await filter_batch(entries)

    return BatchResponse(
        action="push" if result.push_students else "clear",
        students=[BatchStudent(student_id=sid) for sid in result.push_students],
        reasoning=result.reasoning,
    )


# 映射优先级字符串到枚举
def _map_priority(p: str) -> PriorityLevel:
    """将 LLM 返回的优先级字符串映射到 PriorityLevel 枚举。"""
    for level in PriorityLevel:
        if p.lower() == level.value:
            return level
    return PriorityLevel.MEDIUM
