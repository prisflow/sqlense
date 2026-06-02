import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../models/db.js";
import { signToken, authenticate } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400000,
};

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "参数错误" });

  const { username, password } = parsed.data;
  const result = await pool.query(`
    SELECT u.id, u.username, u.password_hash, u.role, u.display_name,
      (SELECT s.id FROM system.students s WHERE s.user_id = u.id) as sid,
      (SELECT s.status FROM system.students s WHERE s.user_id = u.id) as student_status
    FROM system.users u WHERE u.username = $1
  `, [username]);

  if (result.rows.length === 0) return res.status(401).json({ error: "用户名或密码错误" });

  const user = result.rows[0];
  if (user.role === 'student' && (user.student_status === 'disabled' || user.student_status === 'inactive')) {
    return res.status(403).json({ error: "账号已被禁用" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "用户名或密码错误" });

  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role as "teacher" | "student",
    displayName: user.display_name,
  };
  const token = signToken(payload);

  res.cookie("token", token, COOKIE_OPTS);

  pool.query(
    "INSERT INTO system.audit_logs (user_id, username, role, action, detail) VALUES ($1, $2, $3, 'login', '{}')",
    [user.id, user.username, user.role]
  ).catch((err) => console.error("Login audit failed:", err));

  res.json({
    user: { ...payload, studentRecordId: user.sid },
  });
});

authRouter.post("/logout", (req, res) => {
  if (req.user) {
    pool.query(
      "INSERT INTO system.audit_logs (user_id, username, role, action, detail) VALUES ($1, $2, $3, 'logout', '{}')",
      [req.user.userId, req.user.username, req.user.role]
    ).catch((err) => console.error("Logout audit failed:", err));
  }
  res.clearCookie("token", { path: "/" });
  res.json({ message: "已退出" });
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.all("/verify", (req, res) => {
  if (req.cookies?.token) {
    try {
      const user = jwt.verify(req.cookies.token, process.env.JWT_SECRET || "sqlense-dev-secret") as any;
      return res.status(200).json({ valid: true, role: user.role, username: user.username });
    } catch { /* fall through */ }
  }
  res.status(401).json({ valid: false });
});
