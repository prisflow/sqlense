import { Router } from "express";
import { z } from "zod";
import { pool } from "../../models/db.js";
import { audit } from "../common.js";

export const settingsRouter = Router();

// 获取系统设置
settingsRouter.get("/settings", async (_req, res) => {
  await pool.query(`CREATE TABLE IF NOT EXISTS system.settings (key VARCHAR(128) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`).catch((e) => console.warn("Settings table init:", e));
  const result = await pool.query("SELECT key, value FROM system.settings");
  const settings: Record<string, string> = {};
  for (const row of result.rows) settings[row.key] = row.value;
  res.json({ settings });
});

// 更新系统设置
settingsRouter.put("/settings", async (req, res) => {
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
  audit(req.user as any, "update_settings", { updated: entries.map(e => e[0]) });
  res.json({ message: "已更新" });
});
