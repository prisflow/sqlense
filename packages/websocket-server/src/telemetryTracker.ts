export interface TelemetryData {
  type: string;
  timestamp: number;
  payload?: unknown;
}

export interface TrackerConfig {
  highFreqWindowMs: number;
  highFreqThreshold: number;
  globalBatchThreshold: number;
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
  private MAX_BUF = 500;
  private studentBuffers = new Map<string, TelemetryData[]>();
  private studentFreq = new Map<string, number[]>();
  private globalCount = 0;
  private config: TrackerConfig;
  private onFlush: FlushCallback;

  constructor(config: TrackerConfig, onFlush: FlushCallback) {
    this.config = config;
    this.onFlush = onFlush;
  }

  record(studentId: string, data: TelemetryData): void {
    const buf = this.studentBuffers.get(studentId) ?? [];
    buf.push(data);
    if (buf.length > this.MAX_BUF) buf.splice(0, buf.length - this.MAX_BUF);
    this.studentBuffers.set(studentId, buf);

    const now = Date.now();
    const timestamps = this.studentFreq.get(studentId) ?? [];
    timestamps.push(now);
    const recent = timestamps.filter((t) => now - t < this.config.highFreqWindowMs);
    this.studentFreq.set(studentId, recent);

    if (recent.length >= this.config.highFreqThreshold) {
      this.flushStudent(studentId);
    }

    this.globalCount++;
    if (this.globalCount >= this.config.globalBatchThreshold) {
      this.flushGlobal();
    }
  }

  getStudentBuffer(studentId: string): TelemetryData[] {
    return this.studentBuffers.get(studentId) ?? [];
  }

  clearStudent(studentId: string): void {
    this.studentBuffers.delete(studentId);
    this.studentFreq.delete(studentId);
  }

  private flushStudent(studentId: string): void {
    const buf = this.studentBuffers.get(studentId);
    if (!buf || buf.length === 0) return;

    this.studentBuffers.delete(studentId);
    this.studentFreq.delete(studentId);

    Promise.resolve(this.onFlush({
      type: "student",
      studentId,
      telemetry: buf,
    })).catch((err) => console.error("flushStudent callback failed:", err));
  }

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

    Promise.resolve(this.onFlush({
      type: "global",
      entries,
    })).catch((err) => console.error("flushGlobal callback failed:", err));
  }
}
