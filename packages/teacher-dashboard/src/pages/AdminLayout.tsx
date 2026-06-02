import { useEffect, useState } from "react";
import AppHeader from "../components/AppHeader";
import AppSidebar from "../components/AppSidebar";
import AdminDashboard from "./AdminDashboard";
import AdminClasses from "./AdminClasses";
import AdminTeachers from "./AdminTeachers";
import AdminStudents from "./AdminStudents";
import AdminLogs from "./AdminLogs";
import AdminSettings from "./AdminSettings";

export default function AdminLayout() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<{ displayName?: string; username?: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { if (d.user?.role !== "admin") throw new Error(); setUser(d.user); setAuthed(true); })
      .catch((e) => { console.error("Admin auth check failed:", e); window.location.href = "/login"; });
  }, []);

  if (!authed) return null;

  const path = window.location.pathname;
  let content: JSX.Element;
  let title = "";
  if (path.startsWith("/admin/classes")) { content = <AdminClasses />; title = "班级管理"; }
  else if (path.startsWith("/admin/teachers")) { content = <AdminTeachers />; title = "教师管理"; }
  else if (path.startsWith("/admin/students")) { content = <AdminStudents />; title = "学生管理"; }
  else if (path.startsWith("/admin/logs")) { content = <AdminLogs />; title = "操作日志"; }
  else if (path.startsWith("/admin/settings")) { content = <AdminSettings />; title = "系统设置"; }
  else { content = <AdminDashboard />; title = "控制台概览"; }

  return (
    <div className="h-screen flex flex-col bg-white">
      <AppHeader title={title} user={user} onLogout={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; }); }} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto bg-white">{content}</main>
      </div>
    </div>
  );
}
