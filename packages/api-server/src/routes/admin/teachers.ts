import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "../../models/db.js";
import { audit } from "../common.js";

export const teachersRouter = Router();

// 获取所有教师列表
teachersRouter.get("/teachers", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, username, display_name, created_at FROM system.users WHERE role = 'teacher' ORDER BY created_at"
  );
  res.json({ teachers: result.rows });
});

// 创建新教师账号
teachersRouter.post("/teachers", async (req, res) => {
  const schema = z.object({ username: z.string().min(1), password: z.string().min(4), displayName: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const { username, password, displayName } = parsed.data;
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      "INSERT INTO system.users (username, password_hash, role, display_name) VALUES ($1, $2, 'teacher', $3)",
      [username, hash, displayName]
    );
    audit(req.user as any, "create_teacher", { username, displayName });
    res.json({ message: "教师账号已创建" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate")) return res.status(400).json({ error: "账号已存在" });
    throw err;
  }
});

// 删除教师账号
teachersRouter.delete("/teachers/:id", async (req, res) => {
  await pool.query("UPDATE system.classes SET teacher_id = NULL WHERE teacher_id = $1", [req.params.id]);
  const result = await pool.query("DELETE FROM system.users WHERE id = $1 AND role = 'teacher' RETURNING username", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "教师不存在" });
  audit(req.user as any, "delete_teacher", { username: result.rows[0].username });
  res.json({ message: "已删除" });
});
