import { Outlet, useMatches, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthGuard";
import AppHeader from "../components/admin/AppHeader";
import AppSidebar from "../components/admin/AppSidebar";

export default function AdminLayout() {
  const user = useAuth();
  const matches = useMatches();
  const navigate = useNavigate();
  const title = (matches.at(-1)?.handle as { title?: string })?.title ?? "控制台概览";

  return (
    <div className="h-screen flex flex-col bg-white">
      <AppHeader title={title} user={user ?? undefined} onLogout={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => navigate("/login", { replace: true })); }} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto bg-white"><Outlet /></main>
      </div>
    </div>
  );
}
