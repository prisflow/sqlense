import { Link, useLocation } from "react-router-dom";

// 管理后台导航链接配置
const links: { to: string; label: string }[] = [
  { to: "/admin", label: "概览" },
  { to: "/admin/classes", label: "班级" },
  { to: "/admin/teachers", label: "教师" },
  { to: "/admin/students", label: "学生" },
  { to: "/admin/logs", label: "日志" },
  { to: "/admin/settings", label: "设置" },
];

// 管理后台侧边栏，高亮当前激活导航项
export default function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="w-48 border-r border-gray-200 bg-gray-50/50 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <Link to="/admin" className="font-semibold text-sm text-gray-900">管理后台</Link>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map((l) => {
          const isActive = l.to === "/admin" ? pathname === "/admin" : pathname.startsWith(l.to);
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
