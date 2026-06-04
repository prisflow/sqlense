import { createServer } from "node:http";
import { Server } from "socket.io";
import { pool } from "./db.js";
import { TelemetryTracker } from "./telemetryTracker.js";
import type { TelemetryData, FlushEvent } from "./telemetryTracker.js";

const PORT = Number(process.env.PORT) || 3001;
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://ai-gateway:8000";
const API_PORT = Number(process.env.API_PORT) || 3100;

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

const sessions = new Map<string, StudentSession>();
const offlineTimers = new Map<string, NodeJS.Timeout>();
const dsnCache = new Map<string, string>();

async function getStudentDsn(studentId: string): Promise<string> {
  const cached = dsnCache.get(studentId);
  if (cached) return cached;
  try {
    const result = await pool.query(
      `SELECT pg_db_name, pg_role_name, cs_password FROM system.students WHERE student_no = $1`,
      [studentId]
    );
    if (result.rows.length > 0) {
      const s = result.rows[0];
      const dsn = `postgresql://${s.pg_role_name}:${s.cs_password}@postgres:5432/${s.pg_db_name}`;
      dsnCache.set(studentId, dsn);
      return dsn;
    }
  } catch { /* best effort */ }
  return "";
}

// ── Telemetry Tracker ──

async function analyzeStudent(studentId: string, studentName: string, telemetry: TelemetryData[]) {
  let task_description = "";
  let student_dsn = "";

  try {
    const taskResult = await pool.query(
      "SELECT description FROM system.tasks ORDER BY created_at DESC LIMIT 1"
    );
    if (taskResult.rows.length > 0) {
      task_description = taskResult.rows[0].description;
    }
  } catch { /* best effort */ }

  student_dsn = await getStudentDsn(studentId);

  try {
    const response = await fetch(`${AI_GATEWAY_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        telemetry: telemetry.slice(-50),
        task_description,
        student_dsn,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    return await response.json();
  } catch (err) {
    console.error("AI analyze failed:", err);
    return null;
  }
}

const tracker = new TelemetryTracker(
  {
    highFreqWindowMs: 10_000,
    highFreqThreshold: 5,
    globalBatchThreshold: 100,
  },
  async (event: FlushEvent) => {
    if (event.type === "student") {
      const session = sessions.get(event.studentId);
      const analysis = await analyzeStudent(
        event.studentId,
        session?.studentName ?? event.studentId,
        event.telemetry
      );
      if (analysis) {
        io.to("teachers").emit("teacher:ai-analysis", {
          studentId: event.studentId,
          analysis,
        });
      }
    }

    if (event.type === "global") {
      try {
        const response = await fetch(`${AI_GATEWAY_URL}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: event.entries.map((e) => ({
              student_id: e.studentId,
              telemetry: e.telemetry,
            })),
          }),
        });
        const result = await response.json();

        if (result.action === "push" && result.students?.length > 0) {
          for (const s of result.students) {
            const entry = event.entries.find((e) => e.studentId === s.student_id);
            if (entry) {
              const session = sessions.get(s.student_id);
              const analysis = await analyzeStudent(
                s.student_id,
                session?.studentName ?? s.student_id,
                entry.telemetry
              );
              if (analysis) {
                io.to("teachers").emit("teacher:ai-analysis", {
                  studentId: s.student_id,
                  analysis,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("AI batch failed:", err);
      }
    }
  }
);

// ── HTTP API for file notifications ──

import express from "express";
const app = express();
app.use(express.json());

app.post("/api/notify-file", async (req, res) => {
  const { taskId, classIds, filename, url } = req.body;
  if (!taskId || !filename) return res.status(400).json({ error: "missing fields" });

  try {
    const result = await pool.query(
      "SELECT u.username as student_no FROM system.students s JOIN system.users u ON u.id = s.user_id WHERE s.class_id = ANY($1)",
      [classIds]
    );
    for (const row of result.rows) {
      io.to(`student:${row.student_no}`).emit("teacher:task-file", { filename, url });
    }
  } catch (e) {
    console.error("File notify error:", e);
  }
  res.json({ sent: true });
});

app.listen(API_PORT, () => {
  console.log(`WebSocket API server running on port ${API_PORT}`);
});

// ── Socket.IO ──

io.on("connection", (socket) => {
  const role = socket.handshake.query.role as string | undefined;
  const studentId = socket.handshake.query.studentId as string | undefined;
  const studentName = socket.handshake.query.studentName as string | undefined;

  if (role === "teacher") {
    socket.join("teachers");

    const currentOnline = Array.from(sessions.entries()).map(([id, s]) => ({
      studentId: id,
      studentName: s.studentName,
      online: true,
      takeoverActive: s.takeoverActive,
    }));
    if (currentOnline.length > 0) {
      socket.emit("teacher:student-list", currentOnline);
    }

    socket.on("teacher:takeover", ({ studentId }: { studentId: string }) => {
      const session = sessions.get(studentId);
      if (!session) return socket.emit("teacher:error", { message: "学生不在线" });
      if (session.takeoverActive) return socket.emit("teacher:error", { message: "该学生已被接管" });

      session.takeoverActive = true;
      session.takeoverTeacherSocket = socket.id;
      io.to(`student:${studentId}`).emit("takeover:start", { teacherSocketId: socket.id });
      socket.emit("teacher:takeover-started", { studentId });
      io.to("teachers").emit("teacher:status-update", {
        studentId,
        takeoverActive: true,
      });
    });

    socket.on("teacher:takeover-release", ({ studentId }: { studentId: string }) => {
      const session = sessions.get(studentId);
      if (!session) return;
      session.takeoverActive = false;
      io.to(`student:${studentId}`).emit("takeover:stop", {});
      session.takeoverTeacherSocket = null;
      io.to("teachers").emit("teacher:status-update", {
        studentId,
        takeoverActive: false,
      });
    });

    socket.on("teacher:ai-query", async ({ studentId }: { studentId: string }) => {
      const session = sessions.get(studentId);
      if (!session) return socket.emit("teacher:error", { studentId, message: "学生不在线" });

      const telemetry = tracker.getStudentBuffer(studentId);
      const analysis = await analyzeStudent(studentId, session.studentName, telemetry);
      tracker.clearStudent(studentId);
      if (analysis) {
        io.to("teachers").emit("teacher:ai-analysis", { studentId, analysis });
      } else {
        socket.emit("teacher:error", { studentId, message: "AI 分析服务不可用" });
      }
    });

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

    io.to("teachers").emit("teacher:student-online", {
      studentId,
      studentName: session.studentName,
    });

    socket.on("student:telemetry", (data: TelemetryData) => {
      if (data.type === "idle") {
        io.to("teachers").emit("teacher:telemetry", { studentId, data });
        return;
      }

      io.to("teachers").emit("teacher:telemetry", { studentId, data });
      tracker.record(studentId, data);
    });

    socket.on("disconnect", () => {
      sessions.delete(studentId);
      clearTimeout(offlineTimers.get(studentId));
      offlineTimers.set(studentId, setTimeout(() => {
        offlineTimers.delete(studentId);
        if (sessions.has(studentId)) return;
        if (session.takeoverActive && session.takeoverTeacherSocket) {
          io.to(session.takeoverTeacherSocket).emit("takeover:state", {
            type: "disconnected",
          });
        }
        io.to("teachers").emit("teacher:student-offline", { studentId });
      }, 5000));
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`SQLense WebSocket server running on port ${PORT}`);
});
