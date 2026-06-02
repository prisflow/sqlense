import { Router } from "express";
import { z } from "zod";
import { pool } from "../models/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const tasksRouter = Router();

tasksRouter.get("/", authenticate, async (req, res) => {
  const result = await pool.query("SELECT id, title, description, checks, score_rules, created_at FROM system.tasks ORDER BY created_at");
  res.json({ tasks: result.rows });
});

tasksRouter.get("/:id", authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM system.tasks WHERE id = $1", [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "任务不存在" });
  res.json({ task: result.rows[0] });
});

tasksRouter.post("/", authenticate, requireRole('teacher', 'admin'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    setup_sql: z.string().optional(),
    checks: z.array(z.object({
      query: z.string(),
      sql: z.string(),
      expected: z.string(),
    })),
    score_rules: z.record(z.number()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误", detail: parsed.error.issues });

  const { title, description, setup_sql, checks, score_rules } = parsed.data;
  const result = await pool.query(
    "INSERT INTO system.tasks (title, description, setup_sql, checks, score_rules) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [title, description, setup_sql || "", JSON.stringify(checks), JSON.stringify(score_rules)]
  );
  res.json({ id: result.rows[0].id });
});
