import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from schemas.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    PriorityLevel,
    IssueCategory,
    ValidateRequest,
    ValidateResponse,
    BatchRequest,
    BatchResponse,
    BatchStudent,
)
from analyzers.progress import ProgressAnalyzer
from analyzers.priority import PriorityScorer
from config import load_llm_config, get_llm_config
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

progress_analyzer = ProgressAnalyzer()
priority_scorer = PriorityScorer()


@app.on_event("startup")
async def startup():
    cfg = await load_llm_config()
    has_key = bool(cfg.get("api_key"))
    print(f"[startup] LLM config loaded, API key {'present' if has_key else 'MISSING'}")
    print(f"[startup] Base URL: {cfg.get('base_url')}")
    print(f"[startup] Model: {cfg.get('model')}")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def config():
    cfg = get_llm_config()
    return {
        "api_key": "***" if cfg.get("api_key") else None,
        "base_url": cfg.get("base_url"),
        "model": cfg.get("model"),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    progress = progress_analyzer.analyze(req.telemetry)
    rule_priority = priority_scorer.score(progress)

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
            if p.get("codeHistory"):
                code_history = p["codeHistory"]
        if t.type == "error" and p.get("source") == "diagnostics":
            for e in (p.get("errors") or []):
                diagnostics_list.append(e)
        if t.type == "terminal" and p.get("output"):
            terminal_outputs.append(p["output"])
        if t.type == "error":
            errors_count += 1
        if t.type == "idle":
            idle_seconds += p.get("duration", 0)
        if t.type == "terminal":
            attempts += 1

    code_analysis = None
    sql_analysis = None
    agent_diagnosis = None

    has_llm = bool(get_llm_config().get("api_key"))

    if has_llm:
        coros = []
        if code_text:
            coros.append(analyze_code(code_text, "", diagnostics_list, code_history))
        coros.append(analyze_sql(terminal_outputs, req.student_dsn or ""))

        if coros:
            results = await asyncio.gather(*coros)
            idx = 0
            if code_text:
                code_analysis = results[idx]
                idx += 1
            sql_analysis = results[idx]

    if has_llm and (code_analysis or sql_analysis):
        agent_diagnosis = await diagnose(
            code=code_analysis or CodeAnalysis(has_errors=False, issues=[], missing_constraints=[], task_deviation=""),
            sql=sql_analysis or SQLAgentResult(executed_commands=[], errors=[], last_error=None, db_tables=[], mismatches=[]),
            student_id=req.student_id,
            student_name=req.student_name,
            errors_count=errors_count,
            idle_seconds=idle_seconds,
            attempts=attempts,
        )

    diagnosis = agent_diagnosis.diagnosis if agent_diagnosis else ""
    suggestion = agent_diagnosis.suggestion if agent_diagnosis else ""
    priority = _map_priority(agent_diagnosis.priority if agent_diagnosis else rule_priority.value)
    needs_teacher = agent_diagnosis.needs_teacher if agent_diagnosis else False
    suggested_action = agent_diagnosis.suggested_action if agent_diagnosis else "none"

    issues_list: list[IssueCategory] = []
    if agent_diagnosis and agent_diagnosis.issues:
        for i in agent_diagnosis.issues:
            issues_list.append(IssueCategory(
                category=i.category,
                severity=_map_severity(i.severity),
                message=i.detail,
            ))

    return AnalyzeResponse(
        student_id=req.student_id,
        student_name=req.student_name,
        priority=priority,
        progress=progress,
        issues=issues_list,
        diagnosis=diagnosis,
        suggestion=suggestion,
        needs_teacher=needs_teacher,
        suggested_action=suggested_action,
    )


@app.post("/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    issues: list[IssueCategory] = []
    score = 0
    details = []

    if not req.actual_sql:
        issues.append(IssueCategory(category="not_started", severity="error", message="学生尚未提交 SQL"))
        return ValidateResponse(student_id=req.student_id, task_id=req.task_id, passed=False, score=0, issues=issues, details=details)

    sql_upper = req.actual_sql.upper().strip()

    if not sql_upper.startswith("CREATE TABLE"):
        issues.append(IssueCategory(category="wrong_statement", severity="error", message="SQL 语句不是 CREATE TABLE"))
        return ValidateResponse(student_id=req.student_id, task_id=req.task_id, passed=False, score=0, issues=issues, details=details)

    checks = [
        ("SERIAL" in sql_upper, "id SERIAL 主键", 30),
        ("PRIMARY KEY" in sql_upper, "PRIMARY KEY 约束", 20),
        ("NOT NULL" in sql_upper, "NOT NULL 约束", 20),
        ("UNIQUE" in sql_upper, "UNIQUE 约束", 15),
        ("DEFAULT" in sql_upper, "DEFAULT 默认值", 15),
    ]

    for ok, label, pts in checks:
        if ok:
            score += pts
            details.append({"check": label, "passed": True})
        else:
            issues.append(IssueCategory(category="missing_constraint", severity="warning", message=f"缺少 {label}"))
            details.append({"check": label, "passed": False})

    return ValidateResponse(
        student_id=req.student_id,
        task_id=req.task_id,
        passed=score >= 70,
        score=score,
        issues=issues,
        details=details,
    )


@app.post("/batch", response_model=BatchResponse)
async def batch_analyze(req: BatchRequest):
    has_llm = bool(get_llm_config().get("api_key"))

    if not has_llm:
        return BatchResponse(
            action="clear",
            students=[],
            reasoning="LLM 未配置，跳过过滤",
        )

    entries = [e.model_dump() for e in req.entries]
    result = await filter_batch(entries)

    return BatchResponse(
        action="push" if result.push_students else "clear",
        students=[BatchStudent(student_id=sid) for sid in result.push_students],
        reasoning=result.reasoning,
    )


def _map_priority(p: str) -> PriorityLevel:
    for level in PriorityLevel:
        if p.lower() == level.value:
            return level
    return PriorityLevel.MEDIUM


def _map_severity(s: str) -> str:
    if s.lower() in ("error", "warning", "info"):
        return s.lower()
    return "info"
