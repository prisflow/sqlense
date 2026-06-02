import time
from schemas.models import TelemetryEntry, ProgressMetrics


class ProgressAnalyzer:
    def analyze(self, telemetry: list[TelemetryEntry]) -> ProgressMetrics:
        if not telemetry:
            return ProgressMetrics(message="尚未检测到学生活动")

        now = time.time()
        metrics = ProgressMetrics()

        editor_events = [t for t in telemetry if t.type == "editor"]
        terminal_events = [t for t in telemetry if t.type == "terminal"]
        error_events = [t for t in telemetry if t.type == "error"]
        idle_events = [t for t in telemetry if t.type == "idle"]

        metrics.started = len(editor_events) > 0
        metrics.attempts = len(terminal_events)
        metrics.errors = len(error_events)
        metrics.idle_seconds = sum(
            (e.payload or {}).get("duration", 0) for e in idle_events
        )

        last_event = telemetry[-1]
        metrics.last_action_ago = now - last_event.timestamp

        if metrics.errors >= 5:
            metrics.current_pct = 0.2
            metrics.message = "多次错误，可能需要指导"
        elif metrics.attempts >= 3:
            metrics.current_pct = 0.5
            metrics.message = "正在尝试，进展中"
        elif metrics.started and metrics.attempts == 0:
            metrics.current_pct = 0.1
            metrics.message = "刚开始编写 SQL"
        elif not metrics.started:
            metrics.current_pct = 0
            metrics.message = "未开始任务"
        else:
            metrics.current_pct = 0.3
            metrics.message = "活动进行中"

        return metrics
