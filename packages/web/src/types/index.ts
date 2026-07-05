/** 学生基本信息 */
export interface StudentInfo {
  studentId: string;             // 学号
  studentName: string;           // 姓名（中文）
  online: boolean;               // 是否在线（WebSocket 心跳决定）
  idle: boolean;                 // 是否空闲（超过 3 分钟无操作）
  takeoverActive: boolean;       // 教师是否正在接管该学生的 IDE
  csPort: number;                // code-server 端口号（如 8443），用于 iframe 接管
  class_name: string;            // 班级名称
  lastTelemetry: TelemetryData | null;  // 最近一次遥测数据，null 表示从未收到
}

/** 学生 VS Code 遥测数据 */
export interface TelemetryData {
  type: "error" | "idle";          // 事件类型（目前只有 error 和 idle 会被发送）
  timestamp: number;               // 事件发生时间（毫秒时间戳）
  payload?: Record<string, unknown>;  // 事件负载，结构随 type 变化
}

/** 聊天消息 */
export interface ChatMessage {
  id: number;
  classId: string;
  userId: string;
  role: "teacher" | "student";
  displayName: string;
  content: string;
  createdAt: string;
}

/** AI 多智能体分析结果 */
export interface AIAnalysis {
  student_id: string;            // 学号
  student_name: string;          // 姓名
  priority: "critical" | "high" | "medium" | "low";
  diagnosis: string;             // LLM 生成的诊断文本
  suggestion: string;            // LLM 生成的建议文本
  suggested_action?: "none" | "notify" | "popup";
  progress: {
    current_pct: number;         // 进度百分比（0-100）
    message: string;             // 进度描述
  };
}
