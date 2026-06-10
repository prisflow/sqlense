import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { pool } from "../models/db.js";
import { authenticate, type JwtPayload } from "../middleware/auth.js";
import type { Request, Response } from "express";
import { audit } from "./common.js";

export const filesRouter = Router();

const FILE_DIR = process.env.FILE_DIR || "/srv/files";

const sseClients = new Map<string, Set<Response>>();

// 向班级学生推送 SSE 事件
function notifySSE(classId: string, event: string, data: unknown) {
  const clients = sseClients.get(classId);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(msg); } catch { clients.delete(res); }
  });
}

// 内存Buffer
const storage = multer.memoryStorage();
// 限制最大50MB
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// 教师上传文件到班级，需指定任务分组
filesRouter.post("/upload", authenticate, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "未选择文件" });
  if (!req.user || (req.user.role !== "teacher" && req.user.role !== "admin")) {
    return res.status(403).json({ error: "仅教师可上传" });
  }

  const schema = z.object({
    class_id: z.uuidv4(),
    task_group: z.string().min(1, "任务分组不能为空"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.data ? "缺少 task_group" : "参数错误" });
  const { class_id, task_group } = parsed.data;

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
    `INSERT INTO system.task_files (class_id, task_group, filename, filepath, filesize, mime, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [class_id, task_group, originalname, filePath, file.size, file.mimetype, req.user.userId]
  );

  const url = `/files/${class_id}/${savedName}`;
  notifySSE(class_id, "file:uploaded", { filename: originalname, task_group, url, classId: class_id });
  audit(req.user as JwtPayload, "upload_file", { filename: originalname, class_id, task_group, size: file.size });

  res.json({ message: "上传成功", url });
});

// 学生查看本班共享文件列表（含 task_group 标签，前端自行分组）
filesRouter.get("/my", authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== "student") return res.status(403).json({ error: "仅学生可查看" });

  const studentClass = await pool.query(
    "SELECT class_id FROM system.students WHERE user_id = $1",
    [req.user.userId]
  );
  if (studentClass.rows.length === 0) return res.json({ files: [] });
  const classId = studentClass.rows[0].class_id;

  const result = await pool.query(
    `SELECT id, filename, task_group, filesize, mime, created_at, filepath
     FROM system.task_files WHERE class_id = $1
     ORDER BY created_at DESC`,
    [classId]
  );

  res.json({
    files: result.rows.map((f: any) => ({
      id: f.id, filename: f.filename, task_group: f.task_group,
      filesize: f.filesize, mime: f.mime, created_at: f.created_at,
      url: `/api/files/download/${f.id}`,
    })),
  });
});

// 下载文件（含学生权限校验）
filesRouter.get("/download/:fileId", authenticate, async (req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT filename, filepath, class_id, mime FROM system.task_files WHERE id = $1",
    [req.params.fileId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "文件不存在" });
  const f = result.rows[0];

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
  // 作为页面内容的一部分，不弹出下载框
  res.setHeader("Content-Disposition", `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  // 不确定文件类型，浏览器遇到非可预览文件不会预览
  res.setHeader("Content-Type", f.mime || "application/octet-stream");
  const stream = fs.createReadStream(f.filepath);
  stream.pipe(res);
});

// 建立 SSE 连接，推送文件更新通知
filesRouter.get("/events", authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== "student") return res.status(403).json({ error: "仅学生可连接" });

  const studentClass = await pool.query(
    "SELECT class_id FROM system.students WHERE user_id = $1",
    [req.user.userId]
  );
  if (studentClass.rows.length === 0) return res.status(400).json({ error: "未找到班级" });
  const classId = studentClass.rows[0].class_id;

  // 禁用缓存
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");

  if (!sseClients.has(classId)) sseClients.set(classId, new Set());
  sseClients.get(classId)!.add(res);

  // 清理断开连接的 SSE 客户端
  req.on("close", () => {
    sseClients.get(classId)?.delete(res);
    if (sseClients.get(classId)?.size === 0) sseClients.delete(classId);
  });
});
