import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { pool } from "../../models/db.js";
import { audit, execSQL } from "../common.js";

export const studentsRouter = Router();

// 获取学生列表（可按班级筛选）
studentsRouter.get("/students", async (req, res) => {
  const schema = z.object({ class_id: z.uuidv4().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "class_id 格式无效" });
  const classId = parsed.data.class_id;
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

// 更新学生状态（启用/禁用容器）
studentsRouter.put("/students/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["active", "inactive", "disabled"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const r = await pool.query("SELECT student_no, status FROM system.students WHERE id = $1", [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  await pool.query("UPDATE system.students SET status = $1 WHERE id = $2", [parsed.data.status, req.params.id]);
  const containerName = `sqlense-student-${r.rows[0].student_no}`;
  if (parsed.data.status === "disabled") {
    try { execSync(`docker stop ${containerName} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch { /* ok */ }
  } else if (parsed.data.status === "active") {
    try { execSync(`docker start ${containerName} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch (e) { console.error(`Failed to start container ${containerName}:`, e); }
  }
  audit(req.user as any, parsed.data.status === "disabled" ? "disable_student" : "enable_student", { studentId: req.params.id });
  res.json({ message: "状态已更新" });
});

// 删除学生账号及数据库和容器
studentsRouter.delete("/students/:id", async (req, res) => {
  const result = await pool.query("SELECT s.student_no, s.pg_db_name, s.pg_role_name, s.user_id, u.username FROM system.students s JOIN system.users u ON u.id = s.user_id WHERE s.id = $1", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  const { student_no, pg_db_name, pg_role_name, user_id } = result.rows[0];

  await pool.query("DELETE FROM system.students WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM system.users WHERE id = $1", [user_id]);

  try { await execSQL(`DROP DATABASE IF EXISTS "${pg_db_name}"`); } catch { /* ok */ }
  try { await execSQL(`DROP ROLE IF EXISTS "${pg_role_name}"`); } catch { /* ok */ }

  try { execSync(`docker rm -f sqlense-student-${student_no} 2>/dev/null`, { stdio: "ignore", timeout: 10000 }); } catch { /* ok */ }

  audit(req.user as any, "delete_student", { student_no });
  res.json({ message: "已删除" });
});

// 批量导入学生，创建数据库和容器
studentsRouter.post("/students/import", async (req, res) => {
  const schema = z.object({ students: z.array(z.object({
    student_no: z.string().min(1),
    display_name: z.string().min(1),
    password: z.string().min(1),
    class_id: z.uuidv4(),
  }))});
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV 数据格式错误" });

  // 预查重：有重复学号直接中断
  const allNos = parsed.data.students.map(s => s.student_no);
  const existing = await pool.query(
    "SELECT student_no FROM system.students WHERE student_no = ANY($1)",
    [allNos]
  );
  const existingSet = new Set(existing.rows.map((r: any) => r.student_no));
  if (existingSet.size > 0) {
    return res.status(400).json({ error: `学号已存在: ${[...existingSet].join(", ")}` });
  }

  // 全量原子导入：任何一步失败则全部回滚
  const client = await pool.connect();
  let portOffset = 0;
  try {
    const base = await pool.query("SELECT COUNT(*) FROM system.students");
    portOffset = Number(base.rows[0].count);

    await client.query("BEGIN");

    for (const s of parsed.data.students) {
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

      await execSQL(`CREATE ROLE "${roleName}" WITH LOGIN PASSWORD '${escapedPw}'`);
      await execSQL(`CREATE DATABASE "${dbName}" OWNER "${roleName}"`);
      try { await execSQL(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${roleName}"`); } catch { /* ok */ }

      await client.query(
        `INSERT INTO system.students (user_id, class_id, student_no, pg_db_name, pg_role_name, cs_port, cs_password, status)
         VALUES ((SELECT id FROM system.users WHERE username = $1), $2, $1, $3, $4, $5, $6, 'active')`,
        [s.student_no, s.class_id, dbName, roleName, port, s.password]
      );
    }

    await client.query("COMMIT");
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: `导入失败: ${msg}` });
  } finally {
    client.release();
  }

  // 创建容器（资源已提交，容器失败只记日志）
  const image = process.env.STUDENT_IMAGE || "sqlense-student:latest";
  const containerErrors: string[] = [];
  for (const s of parsed.data.students) {
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
        -e STUDENT_NAME=${s.display_name} \
        -e PG_DATABASE=${r.pg_db_name} \
        -e PG_USER=${r.pg_role_name} \
        -e PG_PASSWORD=${r.cs_password} \
        -e WS_SERVER=ws://websocket:3001 \
        -e CODE_SERVER_RECONNECTION_GRACE_TIME=0 \
        -e PG_HOST=postgres \
        ${image}`, { stdio: "pipe", timeout: 30000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to start container for ${s.student_no}: ${msg}`);
      containerErrors.push(`${s.student_no}: ${msg}`);
    }
  }

  audit(req.user as any, "import_students", { count: parsed.data.students.length });
  res.json({
    message: "导入成功",
    count: parsed.data.students.length,
    ...(containerErrors.length > 0 ? { container_errors: containerErrors } : {}),
  });
});

// 检查所有学生容器运行状态
studentsRouter.get("/containers/status", async (_req, res) => {
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
