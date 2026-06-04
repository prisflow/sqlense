from pydantic import BaseModel


class CodeAnalysis(BaseModel):
    has_errors: bool
    issues: list[str]
    missing_constraints: list[str]
    task_deviation: str


class SQLAgentResult(BaseModel):
    executed_commands: list[str]
    errors: list[str]
    last_error: str | None
    db_tables: list[dict] = []
    mismatches: list[str] = []


class Issue(BaseModel):
    category: str
    severity: str
    detail: str


class AgentDiagnosis(BaseModel):
    priority: str
    diagnosis: str
    suggestion: str
    progress_pct: int
    needs_teacher: bool = False
    suggested_action: str = "none"
    issues: list[Issue] = []


class BatchFilterResult(BaseModel):
    push_students: list[str]
    reasoning: str
