import { pool } from "./db.js";
import type { TelemetryData } from "./telemetryTracker.js";

export const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://ai-gateway:8000";

/** task_group 缓存，避免频繁查询 PG。 */
const taskGroupCache = new Map<string, { taskGroup: string; expiresAt: number }>();

/** 查询学生所在班级的最新 task_group，5 分钟缓存 */
export async function getStudentTaskGroup(studentId: string): Promise<string> {
  const cached = taskGroupCache.get(studentId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.taskGroup;
  }
  try {
    const result = await pool.query(
      `SELECT tf.task_group FROM system.task_files tf
       JOIN system.students s ON s.class_id = tf.class_id
       WHERE s.student_no = $1
       ORDER BY tf.created_at DESC
       LIMIT 1`,
      [studentId]
    );
    const taskGroup = result.rows[0]?.task_group ?? "";
    taskGroupCache.set(studentId, { taskGroup, expiresAt: Date.now() + 300_000 });
    return taskGroup;
  } catch (e) {
    console.error("[ws] getStudentTaskGroup error:", studentId, e);
    return "";
  }
}

/** 学生数据库 DSN 缓存，避免频繁查询 PG。 */
const dsnCache = new Map<string, string>();

/** 查询学生 DSN，结果缓存 1 小时 */
async function getStudentDsn(studentId: string): Promise<string> {
  const cached = dsnCache.get(studentId);
  if (cached) {
    console.log("[ws] getStudentDsn cache hit:", studentId);
    return cached;
  }
  try {
    console.log("[ws] getStudentDsn querying DB for:", studentId);
    const result = await pool.query(
      `SELECT pg_db_name, pg_role_name, cs_password FROM system.students WHERE student_no = $1`,
      [studentId]
    );
    if (result.rows.length > 0) {
      const s = result.rows[0];
      const dsn = `postgresql://${s.pg_role_name}:${s.cs_password}@postgres:5432/${s.pg_db_name}`;
      dsnCache.set(studentId, dsn);
      console.log("[ws] getStudentDsn cached DSN for:", studentId);
      return dsn;
    }
    console.warn("[ws] getStudentDsn student not found:", studentId);
  } catch (e) {
    console.error("[ws] getStudentDsn error:", studentId, e);
  }
  return "";
}

/** 发送遥测到 AI Gateway 分析 */
export async function analyzeStudent(
  studentId: string,
  studentName: string,
  telemetry: TelemetryData[],
  taskGroup = ""
) {
  console.log("[ws] analyzeStudent start:", { studentId, studentName, telemetryCount: telemetry.length, taskGroup });
  const student_dsn = await getStudentDsn(studentId);

  try {
    console.log("[ws] analyzeStudent calling AI gateway:", { url: AI_GATEWAY_URL, telemetryCount: telemetry.length });
    const response = await fetch(`${AI_GATEWAY_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        telemetry: telemetry.slice(-50),
        task_group: taskGroup,
        student_dsn,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const result = await response.json();
    console.log("[ws] analyzeStudent AI response:", { studentId, priority: result?.priority });
    return result;
  } catch (err) {
    console.error("[ws] analyzeStudent AI gateway error:", err);
    return null;
  }
}
