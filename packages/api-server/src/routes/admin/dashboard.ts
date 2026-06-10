import { Router } from "express";
import { pool } from "../../models/db.js";

export const dashboardRouter = Router();

// 获取管理员仪表盘统计数据
dashboardRouter.get("/dashboard", async (_req, res) => {
  const classes  = await pool.query("SELECT COUNT(*) FROM system.classes");
  const teachers = await pool.query("SELECT COUNT(*) FROM system.users WHERE role = 'teacher'");
  const students = await pool.query("SELECT COUNT(*) FROM system.users WHERE role = 'student'");
  // 收集24小时内的日志
  const logs = await pool.query("SELECT COUNT(*) FROM system.audit_logs WHERE created_at > NOW() - INTERVAL '24 hours'");
  const running = await pool.query("SELECT COUNT(*) FROM system.students WHERE status = 'active'");
  res.json({
    classCount: Number(classes.rows[0].count),
    teacherCount: Number(teachers.rows[0].count),
    studentCount: Number(students.rows[0].count),
    logCount24h: Number(logs.rows[0].count),
    activeStudentCount: Number(running.rows[0].count),
  });
});
