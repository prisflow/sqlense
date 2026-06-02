import { createServer } from "node:http";
import { Server } from "socket.io";
import { pool } from "./db.js";

const PORT = Number(process.env.PORT) || 3001;
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://ai-gateway:8000";
const API_PORT = Number(process.env.API_PORT) || 3100;

interface StudentSession {
  studentId: string;
  studentName: string;
  socketId: string;
  telemetry: TelemetryData[];
  takeoverActive: boolean;
  takeoverTeacherSocket: string | null;
}

interface TelemetryData {
  type: "editor" | "terminal" | "file" | "idle" | "error" | "progress";
  timestamp: number;
  payload: unknown;
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const sessions = new Map<string, StudentSession>();
const teacherSockets = new Set<string>();
const offlineTimers = new Map<string, NodeJS.Timeout>();

// HTTP API for file notifications
import express from "express";
const app = express();
app.use(express.json());

app.post("/api/notify-file", async (req, res) => {
  const { taskId, classIds, filename, url } = req.body;
  if (!taskId || !filename) return res.status(400).json({ error: "missing fields" });

  // Find students in these classes
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
    teacherSockets.add(socket.id);
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
      if (!session) return socket.emit("teacher:error", { message: "学生不在线" });
      try {
        const response = await fetch(`${AI_GATEWAY_URL}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            student_name: session.studentName,
            telemetry: session.telemetry.slice(-50),
          }),
        });
        const analysis = await response.json();
        socket.emit("teacher:ai-analysis", { studentId, analysis });
      } catch (err) {
        console.error("AI query failed:", err);
        socket.emit("teacher:error", { message: "AI 分析服务不可用" });
      }
    });

    socket.on("disconnect", () => {
      teacherSockets.delete(socket.id);
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
      telemetry: [],
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
      session.telemetry.push(data);
      if (session.telemetry.length > 200) session.telemetry.splice(0, 50);
      io.to("teachers").emit("teacher:telemetry", {
        studentId,
        data,
      });
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
