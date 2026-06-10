import { Router } from "express";
import { pool } from "../../models/db.js";

export const logsRouter = Router();

// 查询审计日志（支持按操作和用户筛选）
logsRouter.get("/logs", async (req, res) => {
  const action = req.query.action as string | undefined;
  const username = req.query.username as string | undefined;
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
  let where = "WHERE created_at > NOW() - $1::interval";
  const params: unknown[] = [`${days} days`];
  let idx = 2;
  if (action) { where += ` AND action = $${idx++}`; params.push(action); }
  if (username) { where += ` AND username = $${idx++}`; params.push(username); }
  const result = await pool.query(
    `SELECT id, username, role, action, detail, ip, created_at FROM system.audit_logs ${where} ORDER BY created_at DESC LIMIT 500`,
    params
  );
  res.json({ logs: result.rows });
});
