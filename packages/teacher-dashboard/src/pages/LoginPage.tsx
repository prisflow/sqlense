import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    if (!username || !password) { setError("请输入账号和密码"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const role = data.user?.role;
      window.location.href = role === "admin" ? "/admin/dashboard" : role === "student" ? "/student/" : "/teacher/";
    } catch (e) { console.error("Login error:", e); setError("网络错误"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <div className="w-3/5 bg-gradient-to-br from-indigo-50 to-white border-r border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            SQLense
          </h1>
          <p className="text-base text-gray-500 mb-2">
            数据库实验教学管理平台
          </p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
            AI 辅助分析学生进度，实时监控编码过程，自动验证 SQL 正确性，教师可远程接管学生 IDE
          </p>
        </div>
      </div>
      <div className="w-2/5 flex items-center justify-center">
        <div className="w-full max-w-sm px-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">登录</h2>
          <p className="text-sm text-gray-500 mb-6">请输入您的账号和密码</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">账号</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="教师账号或学号"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button onClick={handleLogin} disabled={loading} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
              {loading ? "登录中..." : "登录"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
