from pydantic import BaseModel
from typing import Any
from enum import Enum


class PriorityLevel(str, Enum):
    CRITICAL = "critical"
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
    task_description: str = ""
    student_dsn: str = ""


class AnalyzeResponse(BaseModel):
    student_id: str
    student_name: str
    priority: PriorityLevel
    progress: ProgressMetrics
    issues: list[IssueCategory] = []
    diagnosis: str = ""
    suggestion: str = ""
    needs_teacher: bool = False
    suggested_action: str = "none"


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


class BatchTelemetryEntry(BaseModel):
    student_id: str
    telemetry: list[TelemetryEntry]


class BatchRequest(BaseModel):
    entries: list[BatchTelemetryEntry]


class BatchStudent(BaseModel):
    student_id: str


class BatchResponse(BaseModel):
    action: str
    students: list[BatchStudent] = []
    reasoning: str = ""
