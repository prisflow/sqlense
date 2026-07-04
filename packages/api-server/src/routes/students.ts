import { Router } from "express";
import { z } from "zod";
import { pool } from "../models/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const studentsRouter = Router();

// 内部端点：供 code-server 按学号获取工作区配置（内网调用，无需外部认证）
studentsRouter.get("/:studentNo/workspace-env", async (req, res) => {
  const result = await pool.query(`
    SELECT u.display_name, s.student_no, s.pg_db_name, s.pg_role_name, s.cs_password
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    WHERE s.student_no = $1 AND s.status = 'active'
  `, [req.params.studentNo]);
  if (result.rows.length === 0) return res.status(404).json({ error: "未找到学生" });
  res.json({ student: result.rows[0] });
});

studentsRouter.use(authenticate);

// 按用户 ID 查询学生信息
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

// 后面的路由受当前这个以及初始中间件影响
studentsRouter.use(requireRole('teacher', 'admin'));

// 获取全部学生列表
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

// 查看单个学生详情
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

// 更新学生状态
studentsRouter.put("/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["active", "inactive", "disabled"]) });
  // 不抛异常的校验方法
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  await pool.query("UPDATE system.students SET status = $1 WHERE id = $2", [parsed.data.status, req.params.id]);
  res.json({ message: "状态已更新" });
});
