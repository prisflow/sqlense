import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { pool } from "../models/db.js";
import { authenticate, type JwtPayload } from "../middleware/auth.js";
import type { Request, Response } from "express";

export const filesRouter = Router();

function audit(user: JwtPayload | undefined, action: string, detail: Record<string, unknown> = {}) {
  if (!user) return;
  pool.query(
    "INSERT INTO system.audit_logs (user_id, username, role, action, detail) VALUES ($1, $2, $3, $4, $5)",
    [user.userId, user.username, user.role, action, JSON.stringify(detail)]
  ).catch((err) => console.error("Audit log failed:", err));
}

const FILE_DIR = process.env.FILE_DIR || "/srv/files";

const sseClients = new Map<string, Set<Response>>();

function notifySSE(classId: string, event: string, data: unknown) {
  const clients = sseClients.get(classId);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(msg); } catch { clients.delete(res); }
  });
}

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Upload ──
filesRouter.post("/upload", authenticate, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "未选择文件" });
  if (!req.user || (req.user.role !== "teacher" && req.user.role !== "admin")) {
    return res.status(403).json({ error: "仅教师可上传" });
  }

  const schema = z.object({ class_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "缺少 class_id" });
  const { class_id } = parsed.data;

  const file = req.file;
  const originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
  const ext = path.extname(originalname);
  const rand = crypto.randomBytes(8).toString("hex");
  const savedName = `${rand}${ext}`;

  const dir = path.join(FILE_DIR, class_id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, savedName);
  fs.writeFileSync(filePath, file.buffer);

  await pool.query(
    `INSERT INTO system.task_files (class_id, filename, filepath, filesize, mime, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [class_id, originalname, filePath, file.size, file.mimetype, req.user.userId]
  );

  const url = `/files/${class_id}/${savedName}`;
  notifySSE(class_id, "file:uploaded", { filename: originalname, url, classId: class_id });
  audit(req.user as JwtPayload, "upload_file", { filename: originalname, class_id, size: file.size });

  res.json({ message: "上传成功", url });
});

// ── List (student: my class files) ──
filesRouter.get("/my", authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== "student") return res.status(403).json({ error: "仅学生可查看" });

  const studentClass = await pool.query(
    "SELECT class_id FROM system.students WHERE user_id = $1",
    [req.user.userId]
  );
  if (studentClass.rows.length === 0) return res.json({ files: [] });
  const classId = studentClass.rows[0].class_id;

  const result = await pool.query(
    `SELECT id, filename, filesize, mime, created_at, filepath
     FROM system.task_files
     WHERE class_id = $1
     ORDER BY created_at DESC`,
    [classId]
  );

  const files = result.rows.map((f: any) => ({
    ...f,
    url: `/api/files/download/${f.id}`,
  }));
  res.json({ files });
});

// ── Download (with original filename) ──
filesRouter.get("/download/:fileId", authenticate, async (req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT filename, filepath, class_id, mime FROM system.task_files WHERE id = $1",
    [req.params.fileId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "文件不存在" });
  const f = result.rows[0];

  // Students can only access their own class files
  if (req.user?.role === "student") {
    const studentClass = await pool.query(
      "SELECT class_id FROM system.students WHERE user_id = $1",
      [req.user.userId]
    );
    if (studentClass.rows.length === 0 || studentClass.rows[0].class_id !== f.class_id) {
      return res.status(403).json({ error: "无权限" });
    }
  }

  if (!fs.existsSync(f.filepath)) return res.status(404).json({ error: "文件不存在" });

  const encoded = encodeURIComponent(f.filename);
  res.setHeader("Content-Disposition", `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  res.setHeader("Content-Type", f.mime || "application/octet-stream");
  const stream = fs.createReadStream(f.filepath);
  stream.pipe(res);
});

// ── SSE ──
filesRouter.get("/events", authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== "student") return res.status(403).json({ error: "仅学生可连接" });

  const studentClass = await pool.query(
    "SELECT class_id FROM system.students WHERE user_id = $1",
    [req.user.userId]
  );
  if (studentClass.rows.length === 0) return res.status(400).json({ error: "未找到班级" });
  const classId = studentClass.rows[0].class_id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");

  if (!sseClients.has(classId)) sseClients.set(classId, new Set());
  sseClients.get(classId)!.add(res);

  req.on("close", () => {
    sseClients.get(classId)?.delete(res);
    if (sseClients.get(classId)?.size === 0) sseClients.delete(classId);
  });
});
