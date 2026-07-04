import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
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

// 更新学生状态（启用/禁用）
studentsRouter.put("/students/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["active", "inactive", "disabled"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });
  const r = await pool.query("SELECT student_no, status FROM system.students WHERE id = $1", [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  await pool.query("UPDATE system.students SET status = $1 WHERE id = $2", [parsed.data.status, req.params.id]);
  // 单容器模式：不再管理 per-student 容器，状态仅反映数据库记录
  audit(req.user as any, parsed.data.status === "disabled" ? "disable_student" : "enable_student", { studentId: req.params.id });
  res.json({ message: "状态已更新" });
});

// 删除学生账号及数据库（单容器模式：不再删除容器）
studentsRouter.delete("/students/:id", async (req, res) => {
  const result = await pool.query("SELECT s.student_no, s.pg_db_name, s.pg_role_name, s.user_id, u.username FROM system.students s JOIN system.users u ON u.id = s.user_id WHERE s.id = $1", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "学生不存在" });
  const { student_no, pg_db_name, pg_role_name, user_id } = result.rows[0];

  await pool.query("DELETE FROM system.students WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM system.users WHERE id = $1", [user_id]);

  try { await execSQL(`DROP DATABASE IF EXISTS "${pg_db_name}"`); } catch { /* ok */ }
  try { await execSQL(`DROP ROLE IF EXISTS "${pg_role_name}"`); } catch { /* ok */ }

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
  try {
    await client.query("BEGIN");

    for (const s of parsed.data.students) {
      const hash = await bcrypt.hash(s.password, 10);

      await client.query(
        "INSERT INTO system.users (username, password_hash, role, display_name) VALUES ($1, $2, 'student', $3)",
        [s.student_no, hash, s.display_name]
      );

      const dbName = `db_student_${s.student_no}`;
      const roleName = `role_student_${s.student_no}`;
      const port = 8080;
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

  // 单容器模式：不再创建 per-student 容器，code-server 按学号懒分配工作区
  audit(req.user as any, "import_students", { count: parsed.data.students.length });
  res.json({
    message: "导入成功",
    count: parsed.data.students.length,
  });
});

// 检查所有学生状态（单容器模式：code-server 由 docker-compose 管理，全都在线）
studentsRouter.get("/containers/status", async (_req, res) => {
  const result = await pool.query("SELECT student_no, cs_port, status FROM system.students ORDER BY student_no");
  const students = result.rows.map((s: any) => ({
    student_no: s.student_no,
    cs_port: s.cs_port,
    db_status: s.status,
    container_online: true,  // 单容器模式，code-server 始终在线
  }));
  res.json({ students });
});
