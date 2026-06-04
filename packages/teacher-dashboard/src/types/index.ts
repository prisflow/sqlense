export interface StudentInfo {
  studentId: string;
  studentName: string;
  online: boolean;
  idle: boolean;
  takeoverActive: boolean;
  csPort?: number;
  class_name?: string;
  lastTelemetry: TelemetryData | null;
}

export interface TelemetryData {
  type: "editor" | "terminal" | "file" | "idle" | "error" | "progress";
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface AIAnalysis {
  student_id: string;
  student_name: string;
  priority: "critical" | "high" | "medium" | "low";
  needs_teacher?: boolean;
  suggested_action?: string;
  progress: {
    started: boolean;
    attempts: number;
    errors: number;
    idle_seconds: number;
    last_action_ago: number;
    current_pct: number;
    message: string;
  };
  issues: Array<{
    category: string;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
}
