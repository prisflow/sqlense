import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Props {
  studentId: string | null;
  studentName?: string;
  open: boolean;
  onClose: () => void;
}

// VS Code 接管对话框，通过 iframe 展示学生 IDE
export default function VSCodeViewer({ studentId, studentName, open, onClose }: Props) {
  const [ideUrl, setIdeUrl] = useState("");
  const [loadError, setLoadError] = useState(false);
  const fetched = useRef("");

  useEffect(() => {
    if (!studentId || !open) { setIdeUrl(""); setLoadError(false); fetched.current = ""; return; }
    if (fetched.current === studentId) return;
    fetched.current = studentId;
    setLoadError(false);

    // Js的原生取消API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`/api/dashboard/student-by-no/${studentId}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then((d) => { if (d.student) setIdeUrl(`//${window.location.hostname}:${d.student.cs_port}`); else throw new Error("no student"); })
      .catch((e) => { console.error("Failed to get student IDE URL:", e); setLoadError(true); })
      .finally(() => clearTimeout(timeout));

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [studentId, open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent showCloseButton={false} className="!max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh] flex flex-col p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500 font-medium">● 查看中</span>
            <span className="text-sm text-gray-900">{studentName || studentId}</span>
          </div>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded px-2 py-1 transition-colors">关闭</button>
        </div>
        <div className="flex-1 min-h-0 bg-white">
          {!ideUrl ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">加载中...</div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">加载失败，请重试</div>
          ) : (
            <iframe
              src={ideUrl}
              className="w-full h-full"
              title="学生 IDE"
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
