import express from "express";
import type { Server } from "socket.io";
import { pool } from "./db.js";

/** 启动 Express HTTP 辅助服务，接收文件发布通知后广播给对应班级学生 */
export function startFileNotifyServer(io: Server, port: number) {
  const app = express();
  app.use(express.json());

  app.post("/api/notify-file", async (req, res) => {
    const { taskGroup, classIds, filename, url } = req.body;
    console.log("[ws:api] notify-file request:", { taskGroup, classIds, filename, url });
    if (!taskGroup || !filename) {
      console.warn("[ws:api] notify-file missing fields");
      return res.status(400).json({ error: "missing fields" });
    }

    try {
      const result = await pool.query(
        "SELECT u.username as student_no FROM system.students s JOIN system.users u ON u.id = s.user_id WHERE s.class_id = ANY($1)",
        [classIds]
      );
      console.log("[ws:api] notify-file students found:", result.rows.length);
      for (const row of result.rows) {
        io.to(`student:${row.student_no}`).emit("teacher:task-file", { filename, url, taskGroup });
      }
    } catch (e) {
      console.error("[ws:api] File notify error:", e);
    }
    res.json({ sent: true });
  });

  app.listen(port, () => {
    console.log(`[ws:api] API server running on port ${port}`);
  });
}
