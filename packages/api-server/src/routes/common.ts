import { pool } from "../models/db.js";
import type { JwtPayload } from "../middleware/auth.js";

// 记录审计日志到数据库
export function audit(user: JwtPayload | undefined, action: string, detail: Record<string, unknown> = {}) {
  if (!user) return;
  pool.query(
    "INSERT INTO system.audit_logs (user_id, username, role, action, detail) VALUES ($1, $2, $3, $4, $5)",
    [user.userId, user.username, user.role, action, JSON.stringify(detail)]
  ).catch((err) => console.error("Audit log failed:", err));
}

// 用超级用户连接执行 DDL（创建数据库/角色）
export async function execSQL(sql: string): Promise<void> {
  await pool.query("SELECT 1");
  const { default: pg } = await import("pg");
  // 连PG维护库执行DDL
  const superPool = new pg.Pool({
    host: process.env.PG_HOST || "postgres",
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || "sqlense",
    password: process.env.PG_PASSWORD || "sqlense",
    database: "postgres",
  });
  // 执行完关闭连接
  try { await superPool.query(sql); } finally { await superPool.end(); }
}
