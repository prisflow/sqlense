from pydantic import BaseModel
from typing import Any
from enum import Enum


# AI 诊断优先级枚举
class PriorityLevel(str, Enum):
    """AI 诊断优先级。"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# 单条遥测事件数据模型
class TelemetryEntry(BaseModel):
    """学生端发送的单条遥测事件。"""
    type: str
    timestamp: float
    payload: dict[str, Any] | None = None


# 任务进度指标（来自 Judge 输出）
class ProgressMetrics(BaseModel):
    """任务进度指标（来自 Judge 输出）。"""
    current_pct: float = 0
    message: str = ""


# 分析请求数据模型
class AnalyzeRequest(BaseModel):
    """分析请求体。"""
    student_id: str
    student_name: str
    telemetry: list[TelemetryEntry]
    task_group: str = ""
    student_dsn: str = ""


# 分析响应数据模型
class AnalyzeResponse(BaseModel):
    """分析响应体。"""
    student_id: str
    student_name: str
    priority: PriorityLevel
    progress: ProgressMetrics
    diagnosis: str = ""
    suggestion: str = ""
    suggested_action: str = "none"


# 批量遥测条目数据模型
class BatchTelemetryEntry(BaseModel):
    """批量请求中的单条学生遥测条目。"""
    student_id: str
    telemetry: list[TelemetryEntry]


# 批量过滤请求数据模型
class BatchRequest(BaseModel):
    """批量过滤请求体。"""
    entries: list[BatchTelemetryEntry]


# 批量响应学生标识模型
class BatchStudent(BaseModel):
    """批量响应中的学生标识。"""
    student_id: str


# 批量过滤响应数据模型
class BatchResponse(BaseModel):
    """批量过滤响应体。"""
    action: str
    students: list[BatchStudent] = []
    reasoning: str = ""
