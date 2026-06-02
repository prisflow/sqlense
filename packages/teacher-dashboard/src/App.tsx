import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWebSocket } from "./hooks/useWebSocket";
import { useStore } from "./stores/useStore";
import { StudentGrid } from "./components/StudentGrid";
import { AIPriorityPanel } from "./components/AIPriorityPanel";
import VSCodeViewer from "./components/VSCodeViewer";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { StudentInfo } from "./types";

interface User { userId: string; username: string; role: string; displayName: string; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const wsConnected = useStore((s) => s.wsConnected);
  const students = useStore((s) => s.students);
  const selectedStudentId = useStore((s) => s.selectedStudentId);
  const setStudents = useStore((s) => s.setStudents);
  const { requestAnalysis, startTakeover, stopTakeover } = useWebSocket();

  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClassId, setUploadClassId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<{ id: string; name: string }[]>([]);
  const takeoverStudent = students.find(s => s.studentId === selectedStudentId);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        setUser(d.user);
        return fetch("/api/dashboard/my-students").then(r => r.json());
      })
      .then((d) => {
        if (d.students) {
          const mapped: StudentInfo[] = d.students.map((s: any) => ({
            studentId: s.student_no,
            studentName: s.display_name,
            online: false,
            takeoverActive: false,
            csPort: s.cs_port,
            class_name: s.class_name,
            lastTelemetry: null,
          }));
          setStudents(mapped);
        }
        setLoading(false);
      })
      .catch((e) => { console.error("Failed to load teacher data:", e); window.location.href = "/login"; });

    fetch("/api/dashboard/my-classes").then(r => r.json()).then(d => setTeacherClasses(d.classes)).catch(() => {});
  }, []);

  if (loading) return null;

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">SQLense</h1>
          <span className="text-xs text-gray-400">教师控制台</span>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-xs text-gray-500">{user.displayName}</span>}
          <span className="text-xs text-gray-400">{students.filter(s => s.online).length} 在线 / {students.length} 总</span>
          <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-400"}`} />
          <Button variant="ghost" size="sm" onClick={() => setUploadOpen(true)}>共享文件</Button>
          <Button variant="ghost" size="sm" onClick={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; }).catch(() => { window.location.href = "/login"; }); }}>
            退出
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <StudentGrid
            onAnalyze={requestAnalysis}
            onTakeover={(id) => { startTakeover(id); setTakeoverOpen(true); }}
          />
        </div>
        <aside className="w-80 border-l border-gray-200 bg-gray-50/50">
          <AIPriorityPanel />
        </aside>
      </main>

      <VSCodeViewer
        studentId={selectedStudentId}
        studentName={takeoverStudent?.studentName}
        open={takeoverOpen}
        onClose={() => { if (selectedStudentId) stopTakeover(selectedStudentId); setTakeoverOpen(false); }}
      />

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogTitle>共享文件</DialogTitle>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">发送到班级</label>
              <Select value={uploadClassId} onValueChange={setUploadClassId} items={teacherClasses.map(c => ({ label: c.name, value: c.id }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择班级" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>班级</SelectLabel>
                    {teacherClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
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
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>取消</Button>
            <Button onClick={async () => {
              if (!uploadClassId || !uploadFile) { toast.error("请选择班级和文件"); return; }
              const form = new FormData();
              form.append("file", uploadFile);
              form.append("class_id", uploadClassId);
              const res = await fetch("/api/files/upload", { method: "POST", body: form });
              const d = await res.json();
              if (res.ok) { toast.success("上传成功"); setUploadOpen(false); setUploadFile(null); setUploadClassId(""); }
              else { toast.error(d.error || "上传失败"); }
            }}>上传</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
