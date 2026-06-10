export interface TelemetryData {
  type: string;
  timestamp: number;
  payload?: unknown;
}

export interface TrackerConfig {
  highFreqWindowMs: number;      // 高频窗口（毫秒）
  highFreqThreshold: number;     // 窗口内达到此条数触发
  globalBatchThreshold: number;  // 全局累计达到此条数触发
}

export interface StudentFlushEvent {
  type: "student";
  studentId: string;
  telemetry: TelemetryData[];
}

export interface GlobalFlushEvent {
  type: "global";
  entries: { studentId: string; telemetry: TelemetryData[] }[];
}

export type FlushEvent = StudentFlushEvent | GlobalFlushEvent;

type FlushCallback = (event: FlushEvent) => void;

export class TelemetryTracker {
  private MAX_BUF = 500;                                // 单个学生最大缓冲条数
  private studentBuffers = new Map<string, TelemetryData[]>();   // 学生→缓冲列表
  private studentFreq = new Map<string, number[]>();             // 学生→时间戳列表（高频检测用）
  private globalCount = 0;                                        // 全局累计计数
  private config: TrackerConfig;
  private onFlush: FlushCallback;

  // 初始化追踪器配置和回调
  constructor(config: TrackerConfig, onFlush: FlushCallback) {
    this.config = config;
    this.onFlush = onFlush;
    console.log("[ws:tracker] TelemetryTracker created:", config);
  }

  // 记录遥测数据，自动触发回调
  record(studentId: string, data: TelemetryData): void {
    const buf = this.studentBuffers.get(studentId) ?? [];
    buf.push(data);
    if (buf.length > this.MAX_BUF) buf.splice(0, buf.length - this.MAX_BUF);
    this.studentBuffers.set(studentId, buf);

    // 高频检测：窗口内达到阈值 → flushStudent
    const now = Date.now();
    const timestamps = this.studentFreq.get(studentId) ?? [];
    timestamps.push(now);
    const recent = timestamps.filter((t) => now - t < this.config.highFreqWindowMs);
    this.studentFreq.set(studentId, recent);

    console.log("[ws:tracker] record:", { studentId, type: data.type, bufLen: buf.length, freq: recent.length });

    if (recent.length >= this.config.highFreqThreshold) {
      console.log("[ws:tracker] High freq threshold reached, flushing student:", studentId);
      this.flushStudent(studentId);
    }

    // 全局累计
    this.globalCount++;
    if (this.globalCount >= this.config.globalBatchThreshold) {
      console.log("[ws:tracker] Global batch threshold reached, flushing all");
      this.flushGlobal();
    }
  }

  // 获取学生缓冲数据
  getStudentBuffer(studentId: string): TelemetryData[] {
    const buf = this.studentBuffers.get(studentId) ?? [];
    console.log("[ws:tracker] getStudentBuffer:", { studentId, count: buf.length });
    return buf;
  }

  // 清空学生缓冲数据
  clearStudent(studentId: string): void {
    console.log("[ws:tracker] clearStudent:", studentId);
    this.studentBuffers.delete(studentId);
    this.studentFreq.delete(studentId);
  }

  // 触发单个学生高频分析
  private flushStudent(studentId: string): void {
    const buf = this.studentBuffers.get(studentId);
    if (!buf || buf.length === 0) {
      console.log("[ws:tracker] flushStudent skipped (empty):", studentId);
      return;
    }

    this.studentBuffers.delete(studentId);
    this.studentFreq.delete(studentId);

    console.log("[ws:tracker] flushStudent:", { studentId, count: buf.length });
    // 用 Promise.resolve + catch 防止回调异常影响 tracker 后续状态
    Promise.resolve(this.onFlush({
      type: "student",
      studentId,
      telemetry: buf,
    })).catch((err) => console.error("[ws:tracker] flushStudent callback failed:", err));
  }

  // 触发全局批量过滤并清空
  private flushGlobal(): void {
    const entries = Array.from(this.studentBuffers.entries()).map(
      ([studentId, buf]) => ({
        studentId,
        telemetry: buf,
      })
    );

    this.studentBuffers.clear();
    this.studentFreq.clear();
    this.globalCount = 0;

    console.log("[ws:tracker] flushGlobal:", { studentCount: entries.length, totalEvents: entries.reduce((s, e) => s + e.telemetry.length, 0) });
    Promise.resolve(this.onFlush({
      type: "global",
      entries,
    })).catch((err) => console.error("[ws:tracker] flushGlobal callback failed:", err));
  }
}
