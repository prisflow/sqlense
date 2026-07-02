import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../components/AuthGuard";
import { useWebSocket } from "../hooks/useWebSocket";
import { useStore } from "../stores/useStore";
import { StudentGrid } from "../components/teacher/StudentGrid";
import { AIPriorityPanel } from "../components/teacher/AIPriorityPanel";
import VSCodeViewer from "../components/teacher/VSCodeViewer";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { StudentInfo } from "../types";
import { Skeleton } from "@/components/ui/skeleton";

/** 教师控制台主页面 — 学生网格 + AI 分析面板 + 文件共享 + 接管 IDE 弹窗 */
export default function TeacherDashboard() {
  const authUser = useAuth();
  const navigate = useNavigate();

  // ========== 全局状态（Zustand） ==========
  const wsConnected = useStore((s) => s.wsConnected);
  const students = useStore((s) => s.students);
  const selectedStudentId = useStore((s) => s.selectedStudentId);
  const mergeStudent = useStore((s) => s.mergeStudent);

  // ========== WebSocket 操作 ==========
  const { requestAnalysis, startTakeover, stopTakeover } = useWebSocket(authUser?.userId);

  // ========== UI 状态 ==========
  const [loading, setLoading] = useState(true);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClassId, setUploadClassId] = useState("");
  const [uploadTaskGroup, setUploadTaskGroup] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<{ id: string; name: string }[]>([]);
  const takeoverStudent = students.find(s => s.studentId === selectedStudentId);

  /** 初始化：拉取学生列表 + 班级列表 */
  useEffect(() => {
    fetch("/api/dashboard/my-students").then(r => r.json()).then((d) => {
      if (d.students) {
        const existing = useStore.getState().students;
        const existingMap = new Map(existing.map((s) => [s.studentId, s]));
        d.students.forEach((s: any) => {
          const old = existingMap.get(s.student_no);
          mergeStudent({
            studentId: s.student_no,
            studentName: s.display_name,
            online: old?.online ?? false,
            takeoverActive: old?.takeoverActive ?? false,
            csPort: s.cs_port,
            class_name: s.class_name,
            lastTelemetry: old?.lastTelemetry ?? null,
          } as StudentInfo);
        });
      }
      setLoading(false);
    }).catch((e) => { console.error("Failed to load teacher data:", e); navigate("/login", { replace: true }); });

    fetch("/api/dashboard/my-classes").then(r => r.json()).then(d => setTeacherClasses(d.classes)).catch(() => {});
  }, []);

  if (loading) return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">SQLense</h1>
          <span className="text-xs text-gray-400">教师控制台</span>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-2 w-full mb-2" />
              <Skeleton className="h-2 w-3/4 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* ============================== */}
      {/* 顶部导航栏                      */}
      {/* ============================== */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <svg viewBox="0 0 1024 1024" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path fill="#000" d="M507 271c17.5 0 34.5.2 51.5-.1 5.1-.1 7.7 1.8 10.2 6 34.7 60 69.6 119.9 104.3 179.9 30.4 52.4 60.6 105 91 157.5.7 1.3 1.8 2.5 1.3 4.2-1.4 1.5-3.4.9-5.1.9-33.7 0-67.3 0-101-.1-4 0-6.3-1.4-8.3-4.8-29.5-50.7-59.1-101.3-88.7-151.9-28.1-48-56.3-96-84.5-143.9-8.2-14.1-16.5-28.2-24.8-42.3-.7-1.3-1.3-2.6-2.8-5.5 19.5 0 38-.1 57-.1z"/>
              <path fill="#000" d="M472 755.2c-44.2 0-87.9 0-131.3 0-.9-3 .3-4.4 1.1-5.7 17.8-30.9 35.7-61.7 53.4-92.7 2.1-3.8 5-4.1 8.7-4.1 123.6 0 247.3 0 370.9 0 3.8 0 7.6-.4 11.2.5.9 1.7-.2 2.7-.8 3.8-18.4 31.4-36.8 62.6-55 94-2.2 3.8-5 4.2-8.7 4.2-83 .1-166 .2-249.5.2z"/>
              <path fill="#000" d="M376.2 623.1c-24.5 43.8-48.8 87.2-72.8 130.2-2.6.3-3.2-1-3.9-2.1-19.4-31.3-38.8-62.6-58.3-93.8-1.9-3-1.8-5.1 0-8.1 45.8-77.2 91.5-154.5 137.3-231.8 19.2-32.4 38.3-64.8 57.5-97.2.7-1.1 1.6-2.1 2.3-3 2.3.3 2.7 2.1 3.5 3.5 17 29.2 34 58.5 51 87.7 1.8 3.1.8 5.2-.6 7.8-17.6 31.4-35.2 62.8-52.8 94.2-21 37.5-42 75-63.2 112.8z"/>
            </svg>
            SQLense
          </h1>
          <span className="text-xs text-gray-400">教师控制台</span>
        </div>
        <div className="flex items-center gap-4">
          {/* 用户姓名 */}
          {authUser && <span className="text-xs text-gray-500">{authUser.displayName}</span>}
          {/* 在线 / 总人数 */}
          <span className="text-xs text-gray-400">{students.filter(s => s.online).length} 在线 / {students.length} 总</span>
          {/* WebSocket 连接指示灯 */}
          <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-400"}`} />
          {/* 共享文件按钮 */}
          <Button variant="ghost" size="sm" onClick={() => setUploadOpen(true)}>共享文件</Button>
          {/* 退出登录 */}
          <Button variant="ghost" size="sm" onClick={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true })); }}>
            退出
          </Button>
        </div>
      </header>

      {/* ============================== */}
      {/* 主体区域：学生网格 + AI 面板    */}
      {/* ============================== */}
      <main className="flex-1 flex overflow-hidden">
        {/* 学生卡片网格 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <StudentGrid
            onAnalyze={requestAnalysis}
            onTakeover={(id) => { startTakeover(id); setTakeoverOpen(true); }}
          />
        </div>
        {/* 右侧 AI 优先级面板 */}
        <aside className="w-80 border-l border-gray-200 bg-gray-50/50">
          <AIPriorityPanel />
        </aside>
      </main>

      {/* ============================== */}
      {/* VSCode IDE 接管弹窗（iframe）   */}
      {/* ============================== */}
      <VSCodeViewer
        studentId={selectedStudentId}
        studentName={takeoverStudent?.studentName}
        open={takeoverOpen}
        onClose={() => { if (selectedStudentId) stopTakeover(selectedStudentId); setTakeoverOpen(false); }}
      />

      {/* ============================== */}
      {/* 共享文件弹窗（拖拽上传）        */}
      {/* ============================== */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogTitle>共享文件</DialogTitle>
          <div className="space-y-3">
            {/* 班级选择 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">发送到班级</label>
              <Select value={uploadClassId} onValueChange={v => setUploadClassId(v ?? "")} items={teacherClasses.map(c => ({ label: c.name, value: c.id }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>班级</SelectLabel>
                    {teacherClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {/* 任务分组名称 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">任务分组</label>
              <input
                type="text"
                value={uploadTaskGroup}
                onChange={(e) => setUploadTaskGroup(e.target.value)}
                placeholder="例如：SELECT 入门"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            {/* 拖拽 / 点击选择上传文件 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">文件</label>
              <div
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-indigo-500", "bg-indigo-50"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-indigo-500", "bg-indigo-50"); }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-indigo-500", "bg-indigo-50"); setUploadFile(e.dataTransfer.files[0]); }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
                onClick={() => document.getElementById("file-input")?.click()}
              >
                {uploadFile ? (
                  <p className="text-sm text-gray-700">{uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)}KB)</p>
                ) : (
                  <p className="text-sm text-gray-400">拖放文件到此处，或点击选择文件</p>
                )}
              </div>
              <input id="file-input" type="file" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          {/* 上传确认 / 取消 */}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>取消</Button>
            <Button onClick={async () => {
              if (!uploadClassId || !uploadFile) { toast.error("请选择班级和文件"); return; }
              if (!uploadTaskGroup.trim()) { toast.error("请填写任务分组"); return; }
              const form = new FormData();
              form.append("file", uploadFile);
              form.append("class_id", uploadClassId);
              form.append("task_group", uploadTaskGroup.trim());
              const res = await fetch("/api/files/upload", { method: "POST", body: form });
              const d = await res.json();
              if (res.ok) { toast.success("上传成功"); setUploadOpen(false); setUploadFile(null); setUploadClassId(""); setUploadTaskGroup(""); }
              else { toast.error(d.error || "上传失败"); }
            }}>上传</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
