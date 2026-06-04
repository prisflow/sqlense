from schemas.models import PriorityLevel, ProgressMetrics


class PriorityScorer:
    STUCK_IDLE_THRESHOLD = 120
    HIGH_ERROR_THRESHOLD = 5
    MEDIUM_ERROR_THRESHOLD = 2
    STUCK_ACTION_THRESHOLD = 60

    def score(self, metrics: ProgressMetrics) -> PriorityLevel:
        score = 0

        if metrics.errors >= self.HIGH_ERROR_THRESHOLD:
            score += 40
        elif metrics.errors >= self.MEDIUM_ERROR_THRESHOLD:
            score += 20

        if metrics.last_action_ago > self.STUCK_IDLE_THRESHOLD:
            score += 30
        elif metrics.last_action_ago > self.STUCK_ACTION_THRESHOLD:
            score += 15

        if metrics.idle_seconds > self.STUCK_IDLE_THRESHOLD:
            score += 20
        elif metrics.idle_seconds > self.STUCK_ACTION_THRESHOLD:
            score += 10

        if not metrics.started:
            score += 10
            return PriorityLevel.MEDIUM

        if metrics.current_pct >= 0.8:
            score -= 20

        if score >= 60:
            return PriorityLevel.CRITICAL
        elif score >= 40:
            return PriorityLevel.HIGH
        elif score >= 20:
            return PriorityLevel.MEDIUM
        else:
            return PriorityLevel.LOW
