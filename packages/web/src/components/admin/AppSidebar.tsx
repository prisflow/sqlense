// 管理后台导航链接配置
const links: { href: string; label: string }[] = [
  { href: "/admin/dashboard", label: "概览" },
  { href: "/admin/classes", label: "班级" },
  { href: "/admin/teachers", label: "教师" },
  { href: "/admin/students", label: "学生" },
  { href: "/admin/logs", label: "日志" },
  { href: "/admin/settings", label: "设置" },
];

// 管理后台侧边栏，高亮当前激活导航项
export default function AppSidebar() {
  const active = window.location.pathname;

  return (
    <aside className="w-48 border-r border-gray-200 bg-gray-50/50 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <a href="/admin/dashboard" className="font-semibold text-sm text-gray-900">管理后台</a>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map((l) => {
          const isActive = active.startsWith(l.href);
          return (
            <a
              key={l.href}
              href={l.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
