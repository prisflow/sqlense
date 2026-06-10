// 通用应用顶栏，显示页面标题和退出按钮
export default function AppHeader({ title, user, onLogout }: { title: string; user?: { displayName?: string; username?: string }; onLogout?: () => void }) {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-gray-900">SQLense</span>
        <span className="text-sm text-gray-300">/</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        {user && <span className="text-sm text-gray-500">{user.displayName || user.username}</span>}
        {onLogout && (
          <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors bg-gray-100 hover:bg-gray-200 rounded px-2 py-1">
            退出
          </button>
        )}
      </div>
    </header>
  );
}
