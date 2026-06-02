import { Router } from "express";
import { pool } from "../models/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requireRole('teacher', 'admin'));

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

dashboardRouter.get("/my-classes", async (req, res) => {
  const teacherId = req.user?.userId;
  if (!teacherId) return res.status(401).json({ error: "未登录" });
  const result = await pool.query(
    "SELECT id, name FROM system.classes WHERE teacher_id = $1 ORDER BY name",
    [teacherId]
  );
  res.json({ classes: result.rows });
});

dashboardRouter.get("/overview", async (_req, res) => {
  const result = await pool.query(`
    SELECT u.display_name, u.username as student_no,
           s.status, s.cs_port, s.pg_db_name,
           COALESCE(sub.latest_score, 0) as latest_score,
           COALESCE(sub.latest_status, 'pending') as latest_status
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT score as latest_score, status as latest_status
      FROM system.submissions
      WHERE student_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) sub ON true
    ORDER BY u.display_name
  `);
  res.json({ students: result.rows });
});

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

dashboardRouter.get("/student/:studentId", async (req, res) => {
  const result = await pool.query(`
    SELECT s.*, u.display_name, u.username as student_no
    FROM system.students s
    JOIN system.users u ON u.id = s.user_id
    WHERE s.id = $1
  `, [req.params.studentId]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });

  const submissions = await pool.query(`
    SELECT sub.*, t.title as task_title
    FROM system.submissions sub
    JOIN system.tasks t ON t.id = sub.task_id
    WHERE sub.student_id = $1
    ORDER BY sub.created_at DESC LIMIT 20
  `, [req.params.studentId]);

  res.json({ student: result.rows[0], submissions: submissions.rows });
});
