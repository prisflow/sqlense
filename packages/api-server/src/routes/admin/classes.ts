import { Router } from "express";
import { z } from "zod";
import { execSync } from "node:child_process";
import { pool } from "../../models/db.js";
import { audit, execSQL } from "../common.js";

export const classesRouter = Router();

// 获取所有班级列表（含教师姓名） 未分配教师的通过左表班级左连接也显示
classesRouter.get("/classes", async (_req, res) => {
  const result = await pool.query(`
    SELECT c.id, c.name, c.created_at, c.teacher_id, u.display_name as teacher_name
    FROM system.classes c
    LEFT JOIN system.users u ON u.id = c.teacher_id
    ORDER BY c.created_at
  `);
  res.json({ classes: result.rows });
});

// 创建新班级
classesRouter.post("/classes", async (req, res) => {
  const schema = z.object({ name: z.string().min(1), teacher_id: z.uuidv4().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const { name, teacher_id } = parsed.data;
  const result = await pool.query(
    "INSERT INTO system.classes (name, teacher_id) VALUES ($1, $2) RETURNING id",
    [name, teacher_id || null]
  );
  audit(req.user as any, "create_class", { name, teacher_id, classId: result.rows[0].id });
  res.json({ id: result.rows[0].id });
});

// 更新班级信息
classesRouter.put("/classes/:id", async (req, res) => {
  const schema = z.object({ name: z.string().min(1).optional(), teacher_id: z.uuidv4().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (parsed.data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(parsed.data.name); }
  if (parsed.data.teacher_id !== undefined) { fields.push(`teacher_id = $${idx++}`); params.push(parsed.data.teacher_id); }
  if (fields.length === 0) return res.status(400).json({ error: "无修改" });
  params.push(req.params.id);
  await pool.query(`UPDATE system.classes SET ${fields.join(", ")} WHERE id = $${idx}`, params);
  audit(req.user as any, "update_class", { classId: req.params.id });
  res.json({ message: "已更新" });
});

// 删除班级及关联学生和资源
classesRouter.delete("/classes/:id", async (req, res) => {
  const studs = await pool.query("SELECT id, user_id, student_no, pg_db_name, pg_role_name FROM system.students WHERE class_id = $1", [req.params.id]);

  // 删除关联资源
  // stdio: "ignore" 完全丢弃stdout/stderr
  for (const s of studs.rows) {
    try { execSync(`docker rm -f sqlense-student-${s.student_no} 2>/dev/null`, { stdio: "ignore", timeout: 5000 }); } catch { /* ok */ }
    try { await execSQL(`DROP DATABASE IF EXISTS "${s.pg_db_name}"`); } catch { /* ok */ }
    try { await execSQL(`DROP ROLE IF EXISTS "${s.pg_role_name}"`); } catch { /* ok */ }
  }

  const sids = studs.rows.map((s: any) => s.id);
  const uids = studs.rows.map((s: any) => s.user_id);
  if (sids.length > 0) {
    // 批量删除
    await pool.query("DELETE FROM system.task_files WHERE class_id = $1", [req.params.id]);
    await pool.query("DELETE FROM system.students WHERE id = ANY($1)", [sids]);
    await pool.query("DELETE FROM system.users WHERE id = ANY($1)", [uids]);
  }
  await pool.query("DELETE FROM system.classes WHERE id = $1", [req.params.id]);
  audit(req.user as any, "delete_class", { classId: req.params.id, cleanedUp: studs.rows.length });
  res.json({ message: "已删除" });
});
