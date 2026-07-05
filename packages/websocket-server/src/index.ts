import { createServer } from "node:http";
import { Server } from "socket.io";
import { TelemetryTracker } from "./telemetryTracker.js";
import type { TelemetryData, FlushEvent } from "./telemetryTracker.js";
import { AI_GATEWAY_URL, analyzeStudent, getStudentTaskGroup } from "./aiClient.js";
import { pool } from "./db.js";

const PORT = Number(process.env.PORT) || 3001;

/** 学生会话：跟踪连接状态、接管信息。一个学生可以有多个 socket（多标签页/接管 iframe）。 */
interface StudentSession {
  studentId: string;
  studentName: string;
  sockets: Set<string>;
  classId: string | null;
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
/** 聊天频率限制（socketId → 上次发送时间戳） */
const lastChatTime = new Map<string, number>();

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
        const target = session?.classId ? `class:${session.classId}` : "teachers";
        io.to(target).emit("teacher:ai-analysis", { studentId: event.studentId, analysis });
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
                const target = session?.classId ? `class:${session.classId}` : "teachers";
                io.to(target).emit("teacher:ai-analysis", { studentId: s.student_id, analysis });
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

// ── Socket.IO 连接处理 ──

io.on("connection", async (socket) => {
  const role = socket.handshake.query.role as string | undefined;
  const studentId = socket.handshake.query.studentId as string | undefined;
  const studentName = socket.handshake.query.studentName as string | undefined;

  // ── 教师端事件 ──
  if (role === "teacher") {
    socket.join("teachers");
    const teacherId = socket.handshake.query.teacherId as string | undefined;

    // 查该教师的班级列表，加入对应 class: room
    let teacherClassIds: string[] = [];
    if (teacherId) {
      try {
        const result = await pool.query("SELECT id FROM system.classes WHERE teacher_id = $1", [teacherId]);
        teacherClassIds = result.rows.map((r: any) => r.id);
        teacherClassIds.forEach((cid) => socket.join(`class:${cid}`));
      } catch (e) {
        console.error("[ws] Failed to fetch teacher classes:", e);
      }
    }
    socket.data.teacherClassIds = teacherClassIds;

    // 推送当前在线学生列表（仅该教师班级内的学生）
    const currentOnline = Array.from(sessions.entries())
      .filter(([_, s]) => s.sockets.size > 0)
      .filter(([_, s]) => !s.classId || teacherClassIds.includes(s.classId))
      .map(([id, s]) => ({
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
      const takeoverTarget = session.classId ? `class:${session.classId}` : "teachers";
      io.to(takeoverTarget).emit("teacher:status-update", { studentId: sid, takeoverActive: true });
    });

    // 教师释放接管
    socket.on("teacher:takeover-release", ({ studentId: sid }: { studentId: string }) => {
      const session = sessions.get(sid);
      if (!session) return;
      session.takeoverActive = false;
      io.to(`student:${sid}`).emit("takeover:stop", {});
      session.takeoverTeacherSocket = null;
      const releaseTarget = session.classId ? `class:${session.classId}` : "teachers";
      io.to(releaseTarget).emit("teacher:status-update", { studentId: sid, takeoverActive: false });
    });

    // 教师手动触发 AI 分析（前端传 taskGroup）
    socket.on("teacher:ai-query", async ({ studentId: sid, taskGroup }: { studentId: string; taskGroup?: string }) => {
      const session = sessions.get(sid);
      if (!session) return socket.emit("teacher:error", { studentId: sid, message: "学生不在线" });
      const telemetry = tracker.getStudentBuffer(sid);
      const analysis = await analyzeStudent(sid, session.studentName, telemetry, taskGroup);
      tracker.clearStudent(sid);
      if (analysis) {
        const target = session.classId ? `class:${session.classId}` : "teachers";
        io.to(target).emit("teacher:ai-analysis", { studentId: sid, analysis });
      } else {
        socket.emit("teacher:error", { studentId: sid, message: "AI 分析服务不可用" });
      }
    });

    // 教师发送聊天消息
    socket.on("chat:send", async ({ classId, content }: { classId?: string; content?: string }) => {
      if (!content || typeof content !== "string") return;
      content = content.trim();
      if (!content || content.length > 1000) return;
      const now = Date.now();
      if (now - (lastChatTime.get(socket.id) || 0) < 1000) return;
      lastChatTime.set(socket.id, now);
      if (!classId || !socket.data.teacherClassIds?.includes(classId)) {
        return socket.emit("chat:error", { message: "无权向该班级发消息" });
      }
      try {
        const { rows } = await pool.query(
          `INSERT INTO system.chat_messages (class_id, user_id, role, display_name, content)
           VALUES ($1, $2, 'teacher', $3, $4)
           RETURNING id, created_at`,
          [classId, teacherId, socket.handshake.query.teacherName || "教师", content]
        );
        io.to(`class:${classId}`).emit("chat:message", {
          id: rows[0].id, classId, userId: teacherId,
          role: "teacher", displayName: socket.handshake.query.teacherName || "教师",
          content, createdAt: rows[0].created_at,
        });
      } catch (e) {
        console.error("[ws] chat:send error:", e);
      }
    });

    // 教师请求聊天历史
    socket.on("chat:history", async ({ classId }: { classId?: string }, ack?: Function) => {
      if (!classId || !socket.data.teacherClassIds?.includes(classId)) return;
      try {
        const { rows } = await pool.query(
          `SELECT cm.id, cm.class_id AS "classId", cm.user_id AS "userId",
                  cm.role, cm.display_name AS "displayName", cm.content, cm.created_at AS "createdAt"
           FROM system.chat_messages cm
           WHERE cm.class_id = $1
           ORDER BY cm.created_at DESC LIMIT 50`,
          [classId]
        );
        if (ack) ack(rows.reverse());
        else socket.emit("chat:history", { classId, messages: rows.reverse() });
      } catch (e) {
        console.error("[ws] chat:history error:", e);
      }
    });

    // 教师断开时清理其发起的接管
    socket.on("disconnect", () => {
      lastChatTime.delete(socket.id);
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

    // 建占位 session（classId 初始 null，后续补全）
    const wasOnline = sessions.has(studentId);
    if (!sessions.has(studentId)) {
      sessions.set(studentId, {
        studentId, studentName: studentName || studentId,
        sockets: new Set(), classId: null,
        takeoverActive: false, takeoverTeacherSocket: null,
      });
    }
    const session = sessions.get(studentId)!;

    // readyPromise：classId 就绪后 resolve，handler 内 await 它确保不竞态
    let resolveReady: (() => void) | null = null;
    const readyPromise = new Promise<void>(r => { resolveReady = r; });
    if (wasOnline) resolveReady!();

    // 注册 handler（放在任何 await 之前，确保客户端事件不被丢弃）
    socket.on("student:telemetry", (data: TelemetryData) => {
      const target = session.classId ? `class:${session.classId}` : "teachers";
      if (data.type === "idle") {
        io.to(target).emit("teacher:telemetry", { studentId, data });
        return;
      }
      io.to(target).emit("teacher:telemetry", { studentId, data });
      tracker.record(studentId, data);
    });

    socket.on("chat:send", async ({ content }: { content?: string }) => {
      if (!content || typeof content !== "string") return;
      content = content.trim();
      if (!content || content.length > 1000) return;
      const now = Date.now();
      if (now - (lastChatTime.get(socket.id) || 0) < 1000) return;
      lastChatTime.set(socket.id, now);
      const classId = session.classId;
      if (!classId) return;
      try {
        const userResult = await pool.query("SELECT user_id FROM system.students WHERE student_no = $1", [studentId]);
        const userId = userResult.rows[0]?.user_id;
        if (!userId) return;
        const { rows } = await pool.query(
          `INSERT INTO system.chat_messages (class_id, user_id, role, display_name, content)
           VALUES ($1, $2, 'student', $3, $4)
           RETURNING id, created_at`,
          [classId, userId, studentName || studentId, content]
        );
        io.to(`class:${classId}`).emit("chat:message", {
          id: rows[0].id, classId, userId,
          role: "student", displayName: studentName || studentId,
          content, createdAt: rows[0].created_at,
        });
      } catch (e) {
        console.error("[ws] student chat:send error:", e);
      }
    });

    socket.on("chat:history", async (_data: any, ack?: Function) => {
      await readyPromise;
      const classId = session.classId;
      if (!classId) return;
      try {
        const { rows } = await pool.query(
          `SELECT cm.id, cm.class_id AS "classId", cm.user_id AS "userId",
                  cm.role, cm.display_name AS "displayName", cm.content, cm.created_at AS "createdAt"
           FROM system.chat_messages cm
           WHERE cm.class_id = $1
           ORDER BY cm.created_at DESC LIMIT 50`,
          [classId]
        );
        if (ack) ack(rows.reverse());
        else socket.emit("chat:history", { classId, messages: rows.reverse() });
      } catch (e) {
        console.error("[ws] student chat:history error:", e);
      }
    });

    socket.on("disconnect", () => {
      lastChatTime.delete(socket.id);
      const s = sessions.get(studentId);
      if (!s) return;
      s.sockets.delete(socket.id);
      if (s.sockets.size > 0) return;
      sessions.delete(studentId);
      clearTimeout(offlineTimers.get(studentId));
      offlineTimers.set(studentId, setTimeout(() => {
        offlineTimers.delete(studentId);
        if (sessions.has(studentId)) return;
        if (s.takeoverActive && s.takeoverTeacherSocket) {
          io.to(s.takeoverTeacherSocket).emit("takeover:state", { type: "disconnected" });
        }
        if (s.classId) {
          io.to(`class:${s.classId}`).emit("teacher:student-offline", { studentId });
        } else {
          io.to("teachers").emit("teacher:student-offline", { studentId });
        }
      }, 5000));
    });

    // 加入基础房间、开始异步查 classId
    session.sockets.add(socket.id);
    socket.join(`student:${studentId}`);
    if (session.classId) socket.join(`class:${session.classId}`);

    if (!session.classId) {
      pool.query("SELECT class_id FROM system.students WHERE student_no = $1", [studentId])
        .then(r => {
          session.classId = r.rows[0]?.class_id ?? null;
        })
        .catch(e => {
          console.error("[ws] Failed to fetch student class:", e);
        })
        .finally(() => {
          if (session.classId) {
            socket.join(`class:${session.classId}`);
            io.to(`class:${session.classId}`).emit("teacher:student-online", { studentId, studentName: session.studentName });
          } else {
            io.to("teachers").emit("teacher:student-online", { studentId, studentName: session.studentName });
          }
          resolveReady!();
        });
    } else {
      resolveReady!();
    }
  }
});

// 启动 WebSocket 服务
httpServer.listen(PORT, () => {
  console.log(`SQLense WebSocket server running on port ${PORT}`);
});
