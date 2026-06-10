import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthGuard";
import { Button } from "@/components/ui/button";
import StudentDrawer from "../components/student/StudentDrawer";

interface StudentData { student_no: string; display_name: string; pg_db_name: string; pg_role_name: string; cs_password: string; cs_port: number; status: string; }

// 学生仪表盘，展示 IDE 和资料面板
export default function StudentDashboard() {
  const authUser = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentData | null>(null);
  const [ideOpen, setIdeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    fetch(`/api/students/by-user/${authUser!.userId}`)
      .then((r) => r.json())
      .then((sd) => setData(sd.student))
      .catch((e) => console.error("Failed to load student data:", e));
  }, []);

  const ideUrl = data ? `//localhost:${data.cs_port}` : "";

  if (!data) return <div className="min-h-screen bg-white flex items-center justify-center text-gray-400 text-sm">加载中...</div>;

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">SQLense</h1>
          <span className="text-xs text-gray-400">实验平台</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{data.display_name} ({data.student_no})</span>
          <Button variant="ghost" size="sm" onClick={() => setIdeOpen(!ideOpen)}>
            {ideOpen ? "关闭 IDE" : "进入实验环境"}
          </Button>
          <span className="text-xs text-gray-400 cursor-pointer hover:text-gray-700 underline underline-offset-2" onClick={() => setDrawerOpen(!drawerOpen)}>
            {drawerOpen ? "收起资料" : "资料"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true })); }}>
            退出
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 flex flex-col transition-all ${drawerOpen ? "" : ""}`}>
          {ideOpen && data && (
            <div className="flex-1 p-4 pt-3">
              <iframe src={ideUrl} className="w-full h-full border border-gray-200 rounded-lg bg-white" title="实验环境" />
            </div>
          )}
          {!ideOpen && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <div className="text-center">
                <p className="mb-2">点击"进入实验环境"打开 IDE</p>
                <p className="text-xs text-gray-300">
                  数据库: {data.pg_db_name} ｜ 用户: {data.pg_role_name}
                </p>
              </div>
            </div>
          )}
        </div>

        <StudentDrawer data={data} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </div>
  );
}
