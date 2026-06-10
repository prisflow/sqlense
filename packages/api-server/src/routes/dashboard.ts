import { Router } from "express";
import { pool } from "../models/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requireRole('teacher', 'admin'));

// 获取教师班级的学生列表
dashboardRouter.get("/my-students", async (req, res) => {
  const teacherId = req.user?.userId;
  if (!teacherId) return res.status(401).json({ error: "未登录" });

  const result = await pool.query(`
    SELECT u.id as user_id, u.display_name, u.username as student_no,
           s.id as student_id, s.status, s.cs_port, s.pg_db_name,
           c.name as class_name
    FROM system.users u
    JOIN system.students s ON s.user_id = u.id
    JOIN system.classes c ON c.id = s.class_id
    WHERE c.teacher_id = $1
    ORDER BY u.display_name
  `, [teacherId]);

  res.json({ students: result.rows });
});

// 获取当前教师的班级列表
dashboardRouter.get("/my-classes", async (req, res) => {
  const teacherId = req.user?.userId;
  if (!teacherId) return res.status(401).json({ error: "未登录" });
  const result = await pool.query(
    "SELECT id, name FROM system.classes WHERE teacher_id = $1 ORDER BY name",
    [teacherId]
  );
  res.json({ classes: result.rows });
});

// 按学号查询学生详情
dashboardRouter.get("/student-by-no/:studentNo", async (req, res) => {
  const result = await pool.query(`
    SELECT s.*, u.display_name, u.username as student_no
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    WHERE u.username = $1
  `, [req.params.studentNo]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  res.json({ student: result.rows[0] });
});

