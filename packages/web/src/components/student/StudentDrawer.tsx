import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface FileInfo {
  id: string;
  filename: string;
  task_group: string;
  filesize: number;
  mime: string;
  created_at: string;
  url: string;
}

interface StudentData {
  student_no: string;
  display_name: string;
  pg_db_name: string;
  pg_role_name: string;
  cs_password: string;
  cs_port: number;
}

interface Props {
  data: StudentData | null;
  open: boolean;
  onClose: () => void;
}

export default function StudentDrawer({ data, open, onClose }: Props) {
  const [tab, setTab] = useState<"db" | "files">("db");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("");

  // 从前端按 task_group 分组
  const groups = useMemo(() => {
    const g: Record<string, FileInfo[]> = {};
    for (const f of files) {
      const key = f.task_group || "未分组";
      if (!g[key]) g[key] = [];
      g[key].push(f);
    }
    return g;
  }, [files]);

  const groupKeys = useMemo(() => Object.keys(groups), [groups]);

  // 根据当前激活分组筛选显示的文件
  const displayFiles = activeGroup ? groups[activeGroup] || [] : files;

  const loadFiles = () => {
    fetch("/api/files/my")
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    loadFiles();
    const evtSource = new EventSource("/api/files/events");
    evtSource.addEventListener("file:uploaded", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        toast.success(`新文件: ${d.filename}`);
        loadFiles();
      } catch { /* ignore */ }
    });
    evtSource.onerror = () => {};
    return () => evtSource.close();
  }, [open]);

  // 当文件加载完毕，默认选中第一个分组
  useEffect(() => {
    if (groupKeys.length > 0 && !activeGroup) setActiveGroup(groupKeys[0]);
  }, [groupKeys, activeGroup]);

  if (!open) return null;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
        <div className="flex gap-1">
          <button onClick={() => setTab("db")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === "db" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>连接信息</button>
          <button onClick={() => setTab("files")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === "files" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>文件{files.length > 0 ? ` (${files.length})` : ""}</button>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "db" && data && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">数据库连接</h3>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs font-mono">
              <div className="flex justify-between"><span className="text-gray-500">主机</span><span className="text-gray-900">postgres</span></div>
              <div className="flex justify-between"><span className="text-gray-500">端口</span><span className="text-gray-900">5432</span></div>
              <div className="flex justify-between"><span className="text-gray-500">数据库</span><span className="text-gray-900">{data.pg_db_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">用户</span><span className="text-gray-900">{data.pg_role_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">密码</span><span className="text-gray-900">{data.cs_password}</span></div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">连接命令</p>
              <code className="text-xs text-gray-900 break-all">psql -h postgres -U {data.pg_role_name} -d {data.pg_db_name}</code>
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">共享文件</h3>
            {groupKeys.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setActiveGroup("")}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${!activeGroup ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >全部 ({files.length})</button>
                {groupKeys.map((g) => (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${activeGroup === g ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >{g} ({groups[g].length})</button>
                ))}
              </div>
            )}
            {displayFiles.length === 0
              ? <p className="text-xs text-gray-400">暂无文件</p>
              : <div className="space-y-1">
                  {displayFiles.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors">
                        <span className="text-xs">📄</span>
                        <span className="flex-1 truncate">{f.filename}</span>
                        <span className="text-xs text-gray-400">{Math.round(f.filesize / 1024)}KB</span>
                      </a>
                    ))}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
