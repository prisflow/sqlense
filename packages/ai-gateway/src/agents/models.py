from pydantic import BaseModel


# 代码分析结果模型
class CodeAnalysis(BaseModel):
    """代码分析结果（不含任务对比，任务对比由 Judge 负责）。"""
    has_errors: bool
    issues: list[str]
    missing_constraints: list[str]


# SQL 终端分析结果模型
class SQLAgentResult(BaseModel):
    """SQL 终端 + 数据库分析结果。"""
    executed_commands: list[str]
    errors: list[str]
    last_error: str | None
    db_tables: list[dict] = []
    mismatches: list[str] = []


# 综合诊断输出模型
class AgentDiagnosis(BaseModel):
    """Judge 综合诊断输出。"""
    priority: str
    diagnosis: str
    suggestion: str
    progress_pct: int
    progress_message: str = ""
    suggested_action: str = "none"


# 批量过滤输出结果模型
class BatchFilterResult(BaseModel):
    """批量过滤器输出。"""
    push_students: list[str]
    reasoning: str
