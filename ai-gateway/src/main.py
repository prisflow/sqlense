from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from schemas.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    PriorityLevel,
    IssueCategory,
    ValidateRequest,
    ValidateResponse,
)
from analyzers.progress import ProgressAnalyzer
from analyzers.priority import PriorityScorer
import json

app = FastAPI(title="SQLense AI Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

progress_analyzer = ProgressAnalyzer()
priority_scorer = PriorityScorer()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    progress = progress_analyzer.analyze(req.telemetry)
    priority = priority_scorer.score(progress)
    return AnalyzeResponse(
        student_id=req.student_id,
        student_name=req.student_name,
        priority=priority,
        progress=progress,
    )


@app.post("/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    issues: list[IssueCategory] = []
    score = 0
    details = []

    if not req.actual_sql:
        issues.append(IssueCategory(
            category="not_started",
            severity="error",
            message="学生尚未提交 SQL",
        ))
        return ValidateResponse(
            student_id=req.student_id,
            task_id=req.task_id,
            passed=False,
            score=0,
            issues=issues,
            details=details,
        )

    sql_upper = req.actual_sql.upper().strip()

    if not sql_upper.startswith("CREATE TABLE"):
        issues.append(IssueCategory(
            category="wrong_statement",
            severity="error",
            message="SQL 语句不是 CREATE TABLE",
        ))
        return ValidateResponse(
            student_id=req.student_id,
            task_id=req.task_id,
            passed=False,
            score=0,
            issues=issues,
            details=details,
        )

    has_serial = "SERIAL" in sql_upper
    has_primary_key = "PRIMARY KEY" in sql_upper
    has_not_null = "NOT NULL" in sql_upper
    has_unique = "UNIQUE" in sql_upper
    has_default = "DEFAULT" in sql_upper

    checks = [
        (has_serial, "id SERIAL 主键", 30),
        (has_primary_key, "PRIMARY KEY 约束", 20),
        (has_not_null, "NOT NULL 约束", 20),
        (has_unique, "UNIQUE 约束", 15),
        (has_default, "DEFAULT 默认值", 15),
    ]

    for ok, label, pts in checks:
        if ok:
            score += pts
            details.append({"check": label, "passed": True})
        else:
            issues.append(IssueCategory(
                category="missing_constraint",
                severity="warning",
                message=f"缺少 {label}",
            ))
            details.append({"check": label, "passed": False})

    passed = score >= 70
    return ValidateResponse(
        student_id=req.student_id,
        task_id=req.task_id,
        passed=passed,
        score=score,
        issues=issues,
        details=details,
    )
