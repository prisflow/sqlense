import { createServer } from "node:http";
import { Server } from "socket.io";
import { TelemetryTracker } from "./telemetryTracker.js";
import type { TelemetryData, FlushEvent } from "./telemetryTracker.js";
import { AI_GATEWAY_URL, analyzeStudent, getStudentTaskGroup } from "./aiClient.js";
import { startFileNotifyServer } from "./fileNotify.js";

const PORT = Number(process.env.PORT) || 3001;
const API_PORT = Number(process.env.API_PORT) || 3100;

/** 学生会话：跟踪连接状态、接管信息。 */
interface StudentSession {
  studentId: string;
  studentName: string;
  socketId: string;
  takeoverActive: boolean;
  takeoverTeacherSocket: string | null;
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

/** 在线学生会话 Map（studentId → session） */
const sessions = new Map<string, StudentSession>();
/** 断线延迟标记定时器（studentId → timeout） */
const offlineTimers = new Map<string, NodeJS.Timeout>();

/** Telemetry 双缓冲追踪器。
 *
 * - 高频触发: 单个学生 10s 内累积 ≥2 条 error → 自动 /analyze
 * - 全局触发: 跨学生累积 100 条 → /batch 过滤后按需 /analyze
 */
const tracker = new TelemetryTracker(
  {
    highFreqWindowMs: 10_000,
    highFreqThreshold: 2,
    globalBatchThreshold: 100,
  },
  async (event: FlushEvent) => {
    if (event.type === "student") {
      // 单个学生高频触发 → 直接分析（附带当前 task_group）
      console.log("[ws] Tracker flush (student):", { studentId: event.studentId, count: event.telemetry.length });
      const session = sessions.get(event.studentId);
      const taskGroup = await getStudentTaskGroup(event.studentId);
      const analysis = await analyzeStudent(
        event.studentId,
        session?.studentName ?? event.studentId,
        event.telemetry,
        taskGroup
      );
      if (analysis) {
        io.to("teachers").emit("teacher:ai-analysis", { studentId: event.studentId, analysis });
      } else {
        console.warn("[ws] Tracker flush analysis returned null:", event.studentId);
      }
    }

    if (event.type === "global") {
      // 全局批量触发 → 先 /batch 过滤，后逐生 /analyze
      console.log("[ws] Tracker flush (global):", { entryCount: event.entries.length });
      try {
        const response = await fetch(`${AI_GATEWAY_URL}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: event.entries.map((e) => ({ student_id: e.studentId, telemetry: e.telemetry })),
          }),
        });
        const result = await response.json();
        if (result.action === "push" && result.students?.length > 0) {
          for (const s of result.students) {
            const entry = event.entries.find((e) => e.studentId === s.student_id);
            if (entry) {
              const session = sessions.get(s.student_id);
              const taskGroup = await getStudentTaskGroup(s.student_id);
              const analysis = await analyzeStudent(
                s.student_id,
                session?.studentName ?? s.student_id,
                entry.telemetry,
                taskGroup
              );
              if (analysis) {
                io.to("teachers").emit("teacher:ai-analysis", { studentId: s.student_id, analysis });
              }
            }
          }
        }
      } catch (err) {
        console.error("[ws] Global batch failed:", err);
      }
    }
  }
);

// 启动文件广播 HTTP 辅助服务（供 api-server 上传后通知学生）
startFileNotifyServer(io, API_PORT);

// ── Socket.IO 连接处理 ──

io.on("connection", (socket) => {
  const role = socket.handshake.query.role as string | undefined;
  const studentId = socket.handshake.query.studentId as string | undefined;
  const studentName = socket.handshake.query.studentName as string | undefined;

  // ── 教师端事件 ──
  if (role === "teacher") {
    socket.join("teachers");

    // 推送当前在线学生列表
    const currentOnline = Array.from(sessions.entries()).map(([id, s]) => ({
      studentId: id,
      studentName: s.studentName,
      online: true,
      takeoverActive: s.takeoverActive,
    }));
    if (currentOnline.length > 0) socket.emit("teacher:student-list", currentOnline);

    // 教师发起接管学生
    socket.on("teacher:takeover", ({ studentId: sid }: { studentId: string }) => {
      const session = sessions.get(sid);
      if (!session) return socket.emit("teacher:error", { message: "学生不在线" });
      if (session.takeoverActive) return socket.emit("teacher:error", { message: "该学生已被接管" });
      session.takeoverActive = true;
      session.takeoverTeacherSocket = socket.id;
      io.to(`student:${sid}`).emit("takeover:start", { teacherSocketId: socket.id });
      socket.emit("teacher:takeover-started", { studentId: sid });
      io.to("teachers").emit("teacher:status-update", { studentId: sid, takeoverActive: true });
    });

    // 教师释放接管
    socket.on("teacher:takeover-release", ({ studentId: sid }: { studentId: string }) => {
      const session = sessions.get(sid);
      if (!session) return;
      session.takeoverActive = false;
      io.to(`student:${sid}`).emit("takeover:stop", {});
      session.takeoverTeacherSocket = null;
      io.to("teachers").emit("teacher:status-update", { studentId: sid, takeoverActive: false });
    });

    // 教师手动触发 AI 分析（前端传 taskGroup）
    socket.on("teacher:ai-query", async ({ studentId: sid, taskGroup }: { studentId: string; taskGroup?: string }) => {
      const session = sessions.get(sid);
      if (!session) return socket.emit("teacher:error", { studentId: sid, message: "学生不在线" });
      const telemetry = tracker.getStudentBuffer(sid);
      const analysis = await analyzeStudent(sid, session.studentName, telemetry, taskGroup);
      tracker.clearStudent(sid);
      if (analysis) {
        io.to("teachers").emit("teacher:ai-analysis", { studentId: sid, analysis });
      } else {
        socket.emit("teacher:error", { studentId: sid, message: "AI 分析服务不可用" });
      }
    });

    // 教师断开时清理其发起的接管
    socket.on("disconnect", () => {
      for (const [, session] of sessions) {
        if (session.takeoverTeacherSocket === socket.id) {
          session.takeoverActive = false;
          session.takeoverTeacherSocket = null;
          io.to(`student:${session.studentId}`).emit("takeover:stop", {});
        }
      }
    });
  }

  // ── 学生端事件 ──
  if (role === "student" && studentId) {
    clearTimeout(offlineTimers.get(studentId));
    offlineTimers.delete(studentId);
    const session: StudentSession = {
      studentId,
      studentName: studentName || studentId,
      socketId: socket.id,
      takeoverActive: false,
      takeoverTeacherSocket: null,
    };
    sessions.set(studentId, session);
    socket.join(`student:${studentId}`);
    io.to("teachers").emit("teacher:student-online", { studentId, studentName: session.studentName });

    // 接收学生遥测数据：idle 直接转发，其余进 tracker 缓冲
    socket.on("student:telemetry", (data: TelemetryData) => {
      if (data.type === "idle") {
        io.to("teachers").emit("teacher:telemetry", { studentId, data });
        return;
      }
      io.to("teachers").emit("teacher:telemetry", { studentId, data });
      tracker.record(studentId, data);
    });

    // 学生断开 → 延迟 5s 标记离线，避免短暂断线重连闪烁
    socket.on("disconnect", () => {
      sessions.delete(studentId);
      clearTimeout(offlineTimers.get(studentId));
      offlineTimers.set(studentId, setTimeout(() => {
        offlineTimers.delete(studentId);
        if (sessions.has(studentId)) return;
        if (session.takeoverActive && session.takeoverTeacherSocket) {
          io.to(session.takeoverTeacherSocket).emit("takeover:state", { type: "disconnected" });
        }
        io.to("teachers").emit("teacher:student-offline", { studentId });
      }, 5000));
    });
  }
});

// 启动 WebSocket 服务
httpServer.listen(PORT, () => {
  console.log(`SQLense WebSocket server running on port ${PORT}`);
});
