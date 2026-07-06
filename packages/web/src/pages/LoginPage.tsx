import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 根据角色跳转
function redirectPath(role: string) {
  if (role === "admin") return "/admin";
  if (role === "student") return "/student/";
  return "/teacher/";
}

// 登录页面，根据角色跳转不同路由
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
      window.location.href = redirectPath(data.user?.role);
    } catch (e) { console.error("Login error:", e); setError("网络错误"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-white flex relative">
      <div className="w-3/5 bg-gradient-to-br from-indigo-50 via-white to-indigo-100 border-r border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <svg viewBox="0 0 1024 1024" className="w-16 h-16 mx-auto mb-6" xmlns="http://www.w3.org/2000/svg">
            <path fill="#000" d="M507 271c17.5 0 34.5.2 51.5-.1 5.1-.1 7.7 1.8 10.2 6 34.7 60 69.6 119.9 104.3 179.9 30.4 52.4 60.6 105 91 157.5.7 1.3 1.8 2.5 1.3 4.2-1.4 1.5-3.4.9-5.1.9-33.7 0-67.3 0-101-.1-4 0-6.3-1.4-8.3-4.8-29.5-50.7-59.1-101.3-88.7-151.9-28.1-48-56.3-96-84.5-143.9-8.2-14.1-16.5-28.2-24.8-42.3-.7-1.3-1.3-2.6-2.8-5.5 19.5 0 38-.1 57-.1z"/>
            <path fill="#000" d="M472 755.2c-44.2 0-87.9 0-131.3 0-.9-3 .3-4.4 1.1-5.7 17.8-30.9 35.7-61.7 53.4-92.7 2.1-3.8 5-4.1 8.7-4.1 123.6 0 247.3 0 370.9 0 3.8 0 7.6-.4 11.2.5.9 1.7-.2 2.7-.8 3.8-18.4 31.4-36.8 62.6-55 94-2.2 3.8-5 4.2-8.7 4.2-83 .1-166 .2-249.5.2z"/>
            <path fill="#000" d="M376.2 623.1c-24.5 43.8-48.8 87.2-72.8 130.2-2.6.3-3.2-1-3.9-2.1-19.4-31.3-38.8-62.6-58.3-93.8-1.9-3-1.8-5.1 0-8.1 45.8-77.2 91.5-154.5 137.3-231.8 19.2-32.4 38.3-64.8 57.5-97.2.7-1.1 1.6-2.1 2.3-3 2.3.3 2.7 2.1 3.5 3.5 17 29.2 34 58.5 51 87.7 1.8 3.1.8 5.2-.6 7.8-17.6 31.4-35.2 62.8-52.8 94.2-21 37.5-42 75-63.2 112.8z"/>
          </svg>
          <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">
            SQLense
          </h1>
          <p className="text-sm text-gray-400">by Prisflow</p>
          <p className="text-base text-gray-500 mt-6 max-w-xs mx-auto leading-relaxed">
            AI 辅助分析学生进度 · 实时监控编码过程 · 自动验证 SQL 正确性
          </p>
        </div>
      </div>
      <div className="w-2/5 flex flex-col relative">
        <div className="flex-1 flex items-center justify-center">
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
        <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors pointer-events-auto"
          >
            沪ICP备2026028440号
          </a>
        </div>
      </div>
    </div>
  );
}
