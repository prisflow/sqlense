import { Router } from "express";
import { z } from "zod";
import { pool } from "../models/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const studentsRouter = Router();
studentsRouter.use(authenticate);

studentsRouter.get("/by-user/:userId", async (req, res) => {
  const result = await pool.query(`
    SELECT s.*, u.display_name, u.username as student_no
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    WHERE s.user_id = $1
  `, [req.params.userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  res.json({ student: result.rows[0] });
});

studentsRouter.use(requireRole('teacher', 'admin'));

studentsRouter.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT s.id, u.display_name, u.username as student_no,
           s.pg_db_name, s.cs_port, s.status, c.name as class_name
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    JOIN system.classes c ON c.id = s.class_id
    ORDER BY u.display_name
  `);
  res.json({ students: result.rows });
});

studentsRouter.get("/:id", async (req, res) => {
  const result = await pool.query(`
    SELECT s.*, u.display_name, u.username as student_no, c.name as class_name
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    JOIN system.classes c ON c.id = s.class_id
    WHERE s.id = $1
  `, [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  res.json({ student: result.rows[0] });
});

studentsRouter.put("/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["active", "inactive", "disabled"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  await pool.query("UPDATE system.students SET status = $1 WHERE id = $2", [parsed.data.status, req.params.id]);
  res.json({ message: "状态已更新" });
});
