import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileInfo {
  id: string;
  filename: string;
  task_group: string;
  filesize: number;
  mime: string;
  created_at: string;
  url: string;
}

interface ChatMessage {
  id: number;
  classId: string;
  userId: string;
  role: "teacher" | "student";
  displayName: string;
  content: string;
  createdAt: string;
}

interface StudentData {
  student_no: string;
  display_name: string;
  pg_db_name: string;
  pg_role_name: string;
  cs_password: string;
  cs_port: number;
  class_id: string;
}

interface Props {
  data: StudentData | null;
  open: boolean;
  onClose: () => void;
}

export default function StudentDrawer({ data, open, onClose }: Props) {
  const [tab, setTab] = useState<"chat" | "files">("chat");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  const displayFiles = activeGroup ? groups[activeGroup] || [] : files;

  const loadFiles = () => {
    fetch("/api/files/my")
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []))
      .catch(() => {});
  };

  // 文件 SSE（仅首次挂载连接，不随 drawer 开关断连）
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (groupKeys.length > 0 && !activeGroup) setActiveGroup(groupKeys[0]);
  }, [groupKeys, activeGroup]);

  // WebSocket 聊天连接（随组件挂载持续存在，不随 drawer 开关断连）
  useEffect(() => {
    if (!data?.student_no || !data?.class_id) return;
    const socket: Socket = io({
      query: {
        role: "student",
        studentId: data.student_no,
        studentName: data.display_name,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("chat:history", null, (history: ChatMessage[]) => {
        setMessages(history);
      });
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setMessages([]);
    };
  }, [data?.student_no, data?.class_id, data?.display_name]);

  // 新消息自动滚到底
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendChat = useCallback(() => {
    const content = input.trim();
    if (!content || !socketRef.current) return;
    socketRef.current.emit("chat:send", { content });
    setInput("");
  }, [input]);

  return (
    <div className={`w-80 border-l border-gray-200 bg-white flex flex-col shrink-0${!open ? " hidden" : ""}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
        <div className="flex gap-1">
          <button onClick={() => setTab("chat")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === "chat" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>聊天</button>
          <button onClick={() => setTab("files")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${tab === "files" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>文件{files.length > 0 ? ` (${files.length})` : ""}</button>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {tab === "chat" && (
          <>
            <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-gray-400 text-center pt-8">暂无消息</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-sm rounded-lg p-2.5 max-w-[85%] ${m.role === "teacher" ? "bg-blue-50 mr-auto" : "bg-gray-100 ml-auto"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-700">{m.displayName}</span>
                    <span className="text-[10px] text-gray-400">{m.role === "teacher" ? "教师" : "学生"}</span>
                  </div>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 p-3 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="输入消息..."
                className="flex-1 h-9 text-sm"
              />
              <Button size="sm" onClick={sendChat} className="h-9">发送</Button>
            </div>
          </>
        )}

        {tab === "files" && (
          <div className="flex-1 overflow-y-auto p-4">
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
          </div>
        )}
      </div>
    </div>
  );
}
