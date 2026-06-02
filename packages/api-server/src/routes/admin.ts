import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { pool } from "../models/db.js";
import { authenticate, requireRole, type JwtPayload } from "../middleware/auth.js";
import type { Request, Response } from "express";

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

function audit(user: JwtPayload | undefined, action: string, detail: Record<string, unknown> = {}) {
  if (!user) return;
  pool.query(
    "INSERT INTO system.audit_logs (user_id, username, role, action, detail) VALUES ($1, $2, $3, $4, $5)",
    [user.userId, user.username, user.role, action, JSON.stringify(detail)]
  ).catch((err) => console.error("Audit log failed:", err));
}

// ── Dashboard ──
adminRouter.get("/dashboard", async (_req: Request, res: Response) => {
  const classes  = await pool.query("SELECT COUNT(*) FROM system.classes");
  const teachers = await pool.query("SELECT COUNT(*) FROM system.users WHERE role = 'teacher'");
  const students = await pool.query("SELECT COUNT(*) FROM system.users WHERE role = 'student'");
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

// ── Logs ──
adminRouter.get("/logs", async (req: Request, res: Response) => {
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

// ── Teachers ──
adminRouter.get("/teachers", async (_req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT id, username, display_name, created_at FROM system.users WHERE role = 'teacher' ORDER BY created_at"
  );
  res.json({ teachers: result.rows });
});

adminRouter.post("/teachers", async (req: Request, res: Response) => {
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
    audit(req.user as JwtPayload, "create_teacher", { username, displayName });
    res.json({ message: "教师账号已创建" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate")) return res.status(400).json({ error: "账号已存在" });
    throw err;
  }
});

adminRouter.delete("/teachers/:id", async (req: Request, res: Response) => {
  await pool.query("UPDATE system.classes SET teacher_id = NULL WHERE teacher_id = $1", [req.params.id]);
  const result = await pool.query("DELETE FROM system.users WHERE id = $1 AND role = 'teacher' RETURNING username", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "教师不存在" });
  audit(req.user as JwtPayload, "delete_teacher", { username: result.rows[0].username });
  res.json({ message: "已删除" });
});

// ── Classes ──
adminRouter.get("/classes", async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT c.id, c.name, c.created_at, c.teacher_id, u.display_name as teacher_name
    FROM system.classes c
    LEFT JOIN system.users u ON u.id = c.teacher_id
    ORDER BY c.created_at
  `);
  res.json({ classes: result.rows });
});

adminRouter.post("/classes", async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().min(1), teacher_id: z.string().uuid().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const { name, teacher_id } = parsed.data;
  const result = await pool.query(
    "INSERT INTO system.classes (name, teacher_id) VALUES ($1, $2) RETURNING id",
    [name, teacher_id || null]
  );
  audit(req.user as JwtPayload, "create_class", { name, teacher_id, classId: result.rows[0].id });
  res.json({ id: result.rows[0].id });
});

adminRouter.put("/classes/:id", async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().min(1).optional(), teacher_id: z.string().uuid().optional().nullable() });
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
  audit(req.user as JwtPayload, "update_class", { classId: req.params.id });
  res.json({ message: "已更新" });
});

adminRouter.delete("/classes/:id", async (req: Request, res: Response) => {
  const studs = await pool.query("SELECT id, user_id, student_no, pg_db_name, pg_role_name FROM system.students WHERE class_id = $1", [req.params.id]);

  for (const s of studs.rows) {
    try { execSync(`docker rm -f sqlense-student-${s.student_no} 2>/dev/null`, { stdio: "ignore", timeout: 5000 }); } catch { /* ok */ }
    try { await execSQL(`DROP DATABASE IF EXISTS "${s.pg_db_name}"`); } catch { /* ok */ }
    try { await execSQL(`DROP ROLE IF EXISTS "${s.pg_role_name}"`); } catch { /* ok */ }
  }

  const sids = studs.rows.map((s: any) => s.id);
  const uids = studs.rows.map((s: any) => s.user_id);
  if (sids.length > 0) {
    await pool.query("DELETE FROM system.submissions WHERE student_id = ANY($1)", [sids]);
    await pool.query("DELETE FROM system.students WHERE id = ANY($1)", [sids]);
    await pool.query("DELETE FROM system.users WHERE id = ANY($1)", [uids]);
  }
  await pool.query("DELETE FROM system.classes WHERE id = $1", [req.params.id]);
  audit(req.user as JwtPayload, "delete_class", { classId: req.params.id, cleanedUp: studs.rows.length });
  res.json({ message: "已删除" });
});

// ── Students ──
adminRouter.get("/students", async (req: Request, res: Response) => {
  const classId = req.query.class_id as string | undefined;
  let where = "";
  const params: unknown[] = [];
  if (classId) { where = "WHERE s.class_id = $1"; params.push(classId); }
  const result = await pool.query(
    `SELECT s.id, u.display_name, u.username as student_no, s.status, s.cs_port, s.pg_db_name, c.name as class_name
     FROM system.students s
     JOIN system.users u ON u.id = s.user_id
     JOIN system.classes c ON c.id = s.class_id ${where}
     ORDER BY u.display_name`,
    params
  );
  res.json({ students: result.rows });
});

adminRouter.put("/students/:id/status", async (req: Request, res: Response) => {
  const schema = z.object({ status: z.enum(["active", "inactive", "disabled"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const r = await pool.query("SELECT student_no, status FROM system.students WHERE id = $1", [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  await pool.query("UPDATE system.students SET status = $1 WHERE id = $2", [parsed.data.status, req.params.id]);
  // Stop/start container
  const containerName = `sqlense-student-${r.rows[0].student_no}`;
  if (parsed.data.status === "disabled") {
    try { execSync(`docker stop ${containerName} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch { /* ok */ }
  } else if (parsed.data.status === "active") {
    try { execSync(`docker start ${containerName} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch (e) { console.error(`Failed to start container ${containerName}:`, e); }
  }
  audit(req.user as JwtPayload, parsed.data.status === "disabled" ? "disable_student" : "enable_student", { studentId: req.params.id });
  res.json({ message: "状态已更新" });
});

adminRouter.delete("/students/:id", async (req: Request, res: Response) => {
  const result = await pool.query("SELECT s.student_no, s.pg_db_name, s.pg_role_name, s.user_id, u.username FROM system.students s JOIN system.users u ON u.id = s.user_id WHERE s.id = $1", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  const { student_no, pg_db_name, pg_role_name, user_id } = result.rows[0];

  await pool.query("DELETE FROM system.submissions WHERE student_id = $1", [req.params.id]);
  await pool.query("DELETE FROM system.students WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM system.users WHERE id = $1", [user_id]);

  // Clean up PG database and role
  try { await execSQL(`DROP DATABASE IF EXISTS "${pg_db_name}"`); } catch { /* ok */ }
  try { await execSQL(`DROP ROLE IF EXISTS "${pg_role_name}"`); } catch { /* ok */ }

  // Remove container
  try { execSync(`docker rm -f sqlense-student-${student_no} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch { /* ok */ }

  audit(req.user as JwtPayload, "delete_student", { student_no });
  res.json({ message: "已删除" });
});

// ── Student Import (full: DB + container) ──
async function execSQL(sql: string): Promise<void> {
  await pool.query("SELECT 1"); // verify connection
  // For PG admin tasks (CREATE DATABASE/ROLE) we need to run as superuser
  // Connect to the 'postgres' maintenance database
  const { default: pg } = await import("pg");
  const superPool = new pg.Pool({
    host: process.env.PG_HOST || "postgres",
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || "sqlense",
    password: process.env.PG_PASSWORD || "sqlense",
    database: "postgres",
  });
  try { await superPool.query(sql); } finally { await superPool.end(); }
}

adminRouter.post("/students/import", async (req: Request, res: Response) => {
  const schema = z.object({ students: z.array(z.object({
    student_no: z.string().min(1),
    display_name: z.string().min(1),
    password: z.string().min(1),
    class_id: z.string().uuid(),
  }))});
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV 数据格式错误" });

  const results: { student_no: string; status: string; error?: string }[] = [];

  const client = await pool.connect();
  let portOffset = 0;
  try {
    const base = await pool.query("SELECT COUNT(*) FROM system.students");
    portOffset = Number(base.rows[0].count);

    for (const s of parsed.data.students) {
      try {
        await client.query("BEGIN");
        const hash = await bcrypt.hash(s.password, 10);

        await client.query(
          "INSERT INTO system.users (username, password_hash, role, display_name) VALUES ($1, $2, 'student', $3)",
          [s.student_no, hash, s.display_name]
        );

        const dbName = `db_student_${s.student_no}`;
        const roleName = `role_student_${s.student_no}`;
        portOffset++;
        const port = 8443 + portOffset;

        const escapedPw = s.password.replace(/'/g, "''");
        try { await execSQL(`CREATE ROLE "${roleName}" WITH LOGIN PASSWORD '${escapedPw}'`); } catch (e: unknown) { console.warn(`CSV import: CREATE ROLE failed for ${s.student_no}:`, e instanceof Error ? e.message : e); }
        try { await execSQL(`CREATE DATABASE "${dbName}" OWNER "${roleName}"`); } catch (e: unknown) { console.warn(`CSV import: CREATE DATABASE failed for ${s.student_no}:`, e instanceof Error ? e.message : e); }
        try { await execSQL(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${roleName}"`); } catch { /* ok */ }
        try { await execSQL(`CREATE SCHEMA IF NOT EXISTS lab AUTHORIZATION "${roleName}"`); } catch { /* ok */ }

        await client.query(
          `INSERT INTO system.students (user_id, class_id, student_no, pg_db_name, pg_role_name, cs_port, cs_password, status)
           VALUES ((SELECT id FROM system.users WHERE username = $1), $2, $1, $3, $4, $5, $6, 'active')`,
          [s.student_no, s.class_id, dbName, roleName, port, s.password]
        );

        await client.query("COMMIT");
        results.push({ student_no: s.student_no, status: "ok" });
      } catch (err: unknown) {
        await client.query("ROLLBACK").catch((e) => console.error("CSV import ROLLBACK failed:", e));
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("duplicate")) results.push({ student_no: s.student_no, status: "error", error: "学号已存在" });
        else if (msg.includes("CREATE ROLE") || msg.includes("CREATE DATABASE")) results.push({ student_no: s.student_no, status: "error", error: "数据库创建失败" });
        else results.push({ student_no: s.student_no, status: "error", error: "导入失败" });
      }
    }
  } finally {
    client.release();
  }

  // Try to start code-server containers
  const okStudents = results.filter(r => r.status === "ok");
  for (const s of okStudents) {
    try {
      const record = await pool.query("SELECT cs_port, cs_password, pg_db_name, pg_role_name FROM system.students WHERE student_no = $1", [s.student_no]);
      if (record.rows.length === 0) continue;
      const r = record.rows[0];
      const name = `sqlense-student-${s.student_no}`;
      execSync(`docker rm -f ${name} 2>/dev/null; docker run -d \
        --name ${name} \
        --network ${process.env.DOCKER_NETWORK || "sqlense_default"} \
        --label com.docker.compose.project=${process.env.COMPOSE_PROJECT_NAME || "sqlense"} \
        -p ${r.cs_port}:8443 \
        -e STUDENT_NO=${s.student_no} \
        -e STUDENT_NAME=${s.student_no} \
        -e PASSWORD=${r.cs_password} \
        -e PG_DATABASE=${r.pg_db_name} \
        -e PG_USER=${r.pg_role_name} \
        -e PG_PASSWORD=${r.cs_password} \
        -e WS_SERVER=ws://websocket:3001 \
        -e PG_HOST=postgres \
        sqlense-student-1:latest`, { stdio: "ignore", timeout: 30000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to start container for ${s.student_no}: ${msg}`);
    }
  }

  audit(req.user as JwtPayload, "import_students", { count: okStudents.length });
  res.json({ results });
});

// ── Container Status ──
adminRouter.get("/containers/status", async (_req: Request, res: Response) => {
  const result = await pool.query("SELECT student_no, cs_port, status FROM system.students ORDER BY student_no");
  const students = [];
  for (const s of result.rows) {
    let online = false;
    try {
      const out = execSync(`docker inspect --format='{{.State.Status}}' sqlense-student-${s.student_no} 2>/dev/null || true`, { encoding: "utf-8", timeout: 5000 });
      online = out.trim() === "running";
    } catch { /* not running */ }
    students.push({ student_no: s.student_no, cs_port: s.cs_port, db_status: s.status, container_online: online });
  }
  res.json({ students });
});

// ── Settings ──
adminRouter.get("/settings", async (_req: Request, res: Response) => {
  await pool.query(`CREATE TABLE IF NOT EXISTS system.settings (key VARCHAR(128) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`).catch((e) => console.warn("Settings table init:", e));
  const result = await pool.query("SELECT key, value FROM system.settings");
  const settings: Record<string, string> = {};
  for (const row of result.rows) settings[row.key] = row.value;
  res.json({ settings });
});

adminRouter.put("/settings", async (req: Request, res: Response) => {
  const schema = z.object({
    log_retention_days: z.number().int().min(1).max(365).optional(),
    llm_api_key: z.string().optional(),
    llm_base_url: z.string().optional(),
    llm_model: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const entries = Object.entries(parsed.data).filter(([_, v]) => v !== undefined);
  for (const [key, value] of entries) {
    await pool.query(
      "INSERT INTO system.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
      [key, String(value)]
    );
  }
  audit(req.user as JwtPayload, "update_settings", { updated: entries.map(e => e[0]) });
  res.json({ message: "已更新" });
});
