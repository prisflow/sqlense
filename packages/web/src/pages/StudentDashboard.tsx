import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  const ideUrl = data ? `//${window.location.hostname}:8080/student-${data.student_no}/` : "";

  if (!data) return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-28 rounded" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-8 w-12 rounded" />
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Skeleton className="h-4 w-48 mx-auto mb-2" />
          <Skeleton className="h-3 w-64 mx-auto" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <svg viewBox="0 0 1024 1024" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path fill="#000" d="M507 271c17.5 0 34.5.2 51.5-.1 5.1-.1 7.7 1.8 10.2 6 34.7 60 69.6 119.9 104.3 179.9 30.4 52.4 60.6 105 91 157.5.7 1.3 1.8 2.5 1.3 4.2-1.4 1.5-3.4.9-5.1.9-33.7 0-67.3 0-101-.1-4 0-6.3-1.4-8.3-4.8-29.5-50.7-59.1-101.3-88.7-151.9-28.1-48-56.3-96-84.5-143.9-8.2-14.1-16.5-28.2-24.8-42.3-.7-1.3-1.3-2.6-2.8-5.5 19.5 0 38-.1 57-.1z"/>
              <path fill="#000" d="M472 755.2c-44.2 0-87.9 0-131.3 0-.9-3 .3-4.4 1.1-5.7 17.8-30.9 35.7-61.7 53.4-92.7 2.1-3.8 5-4.1 8.7-4.1 123.6 0 247.3 0 370.9 0 3.8 0 7.6-.4 11.2.5.9 1.7-.2 2.7-.8 3.8-18.4 31.4-36.8 62.6-55 94-2.2 3.8-5 4.2-8.7 4.2-83 .1-166 .2-249.5.2z"/>
              <path fill="#000" d="M376.2 623.1c-24.5 43.8-48.8 87.2-72.8 130.2-2.6.3-3.2-1-3.9-2.1-19.4-31.3-38.8-62.6-58.3-93.8-1.9-3-1.8-5.1 0-8.1 45.8-77.2 91.5-154.5 137.3-231.8 19.2-32.4 38.3-64.8 57.5-97.2.7-1.1 1.6-2.1 2.3-3 2.3.3 2.7 2.1 3.5 3.5 17 29.2 34 58.5 51 87.7 1.8 3.1.8 5.2-.6 7.8-17.6 31.4-35.2 62.8-52.8 94.2-21 37.5-42 75-63.2 112.8z"/>
            </svg>
            SQLense
          </h1>
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
