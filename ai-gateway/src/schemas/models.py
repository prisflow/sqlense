from pydantic import BaseModel
from typing import Any
from enum import Enum


class PriorityLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IssueSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class IssueCategory(BaseModel):
    category: str
    severity: IssueSeverity
    message: str


class TelemetryEntry(BaseModel):
    type: str
    timestamp: float
    payload: dict[str, Any] | None = None


class ProgressMetrics(BaseModel):
    started: bool = False
    attempts: int = 0
    errors: int = 0
    idle_seconds: float = 0
    last_action_ago: float = 0
    current_pct: float = 0
    message: str = ""


class AnalyzeRequest(BaseModel):
    student_id: str
    student_name: str
    telemetry: list[TelemetryEntry]


class AnalyzeResponse(BaseModel):
    student_id: str
    student_name: str
    priority: PriorityLevel
    progress: ProgressMetrics
    issues: list[IssueCategory] = []


class ValidateRequest(BaseModel):
    student_id: str
    task_id: int
    actual_sql: str
    expected_schema: dict[str, Any] = {}


class ValidateResponse(BaseModel):
    student_id: str
    task_id: int
    passed: bool
    score: float
    issues: list[IssueCategory]
    details: list[dict[str, Any]]
