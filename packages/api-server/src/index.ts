import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin/index.js";
import { studentsRouter } from "./routes/students.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { filesRouter } from "./routes/files.js";
import { pool } from "./models/db.js";

const app = express();
const PORT = Number(process.env.API_PORT) || 4000;

/**
 * origin: true 反射请求来源（达到Access-Control-Allow-Origi: *的效果)
 * credentials: true 让浏览器带cookie过来
 */
app.use(cors({ origin: true, credentials: true }));
//
app.use(express.json());
app.use(cookieParser());

app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/files", filesRouter);

// 健康检查接口
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 等待数据库就绪（最多重试 30 次）
async function waitForDb(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      console.log(`Waiting for database... (${i + 1}/30)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Database not available after 60s");
}

// 启动服务器，等待数据库就绪后开始服务
app.listen(PORT, async () => {
  console.log(`SQLense API server running on port ${PORT}`);
  await waitForDb();

  // 每小时清理过期日志
  setInterval(async () => {
    try {
      let setting = { rows: [{ value: '90' }] };
    try { setting = await pool.query("SELECT value FROM system.settings WHERE key = 'log_retention_days'"); }
    catch (e) { console.warn("Log retention settings query failed, using default 90 days:", e); }
      // 防止设置为0或负数被一次性删光、以及超过一年都要删除
      const days = Math.max(1, Math.min(365, Number(setting.rows[0]?.value) || 90));
      // 删除超过天数的日志
      const result = await pool.query("DELETE FROM system.audit_logs WHERE created_at < NOW() - $1::interval", [`${days} days`]);
      // 日志成功删除
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Cleaned ${result.rowCount} log entries older than ${days} days`);
      }
    } catch (err) {
      console.error("Log cleanup error:", err);
    }
  }, 3600000);
});

// 优雅关闭时断开数据库连接
process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
