import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "sqlense-dev-secret";

export interface JwtPayload {
  userId: string;
  username: string;
  role: "admin" | "teacher" | "student";
  displayName: string;
}

// 声明合并 给Express的Request加上User属性
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// 验证 JWT Token，将用户信息注入 req
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "未登录" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期" });
  }
}

// 返回角色权限校验中间件
export function requireRole(...roles: string[]) {
  // 校验当前用户角色是否匹配
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "无权限" });
    }
    next();
  };
}

// 生成 24 小时有效的 JWT Token
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}
