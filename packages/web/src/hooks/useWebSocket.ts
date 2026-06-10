import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import { useStore } from "../stores/useStore";
import type { TelemetryData, AIAnalysis, StudentInfo } from "../types";

// 截断长文本，超出部分用省略号替代
function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// 管理 WebSocket 连接，接收实时遥测和 AI 分析
export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useStore();

  useEffect(() => {
    const socket = io({
      query: { role: "teacher" },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => store.setWsConnected(true));
    socket.on("disconnect", () => store.setWsConnected(false));

    socket.on("teacher:student-list", (students: Partial<StudentInfo>[]) => {
      students.forEach((s) => store.mergeStudent({ ...s, online: true, idle: false } as StudentInfo));
    });

    socket.on("teacher:student-online", (student: Partial<StudentInfo>) => {
      store.mergeStudent({ ...student, online: true, idle: false } as StudentInfo);
    });

    socket.on("teacher:student-offline", ({ studentId }: { studentId: string }) => {
      store.mergeStudent({ studentId, online: false, idle: false } as StudentInfo);
    });

    socket.on("teacher:telemetry", ({ studentId, data }: { studentId: string; data: TelemetryData }) => {
      store.mergeStudent({
        studentId,
        online: true,
        idle: data.type === "idle",
        lastTelemetry: data,
      } as StudentInfo);
    });

    socket.on("teacher:ai-analysis", ({ studentId, analysis }: { studentId: string; analysis: AIAnalysis }) => {
      store.setAnalysis(studentId, analysis);

      if (!analysis.diagnosis && !analysis.suggestion) {
        toast.warning("AI 分析不可用", {
          description: "未配置 LLM API Key，使用规则引擎评估",
        });
        return;
      }

      if (analysis.suggested_action === "popup") {
        toast.info(analysis.student_name, {
          description: truncate(analysis.diagnosis),
          action: { label: "查看", onClick: () => store.setSelectedStudentId(studentId) },
        });
      } else if (analysis.suggested_action === "notify" || analysis.priority === "critical") {
        toast.warning(analysis.student_name, {
          description: truncate(analysis.diagnosis),
        });
      }
    });

    socket.on("teacher:error", ({ studentId, message }: { studentId?: string; message: string }) => {
      toast.error(message);
      if (studentId) store.setAnalyzing(studentId, false);
    });

    socket.on("teacher:status-update", ({ studentId, takeoverActive }: { studentId: string; takeoverActive: boolean }) => {
      store.mergeStudent({ studentId, takeoverActive });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 请求 AI 分析指定学生的代码（可指定任务分组）
  const requestAnalysis = (studentId: string, taskGroup?: string) => {
    store.setAnalyzing(studentId, true);
    socketRef.current?.emit("teacher:ai-query", { studentId, taskGroup });
  };

  // 开始接管学生 IDE
  const startTakeover = (studentId: string) => {
    socketRef.current?.emit("teacher:takeover", { studentId });
    store.setSelectedStudentId(studentId);
  };

  // 停止接管并释放学生 IDE
  const stopTakeover = (studentId: string) => {
    socketRef.current?.emit("teacher:takeover-release", { studentId });
    store.setSelectedStudentId(null);
  };

  return { requestAnalysis, startTakeover, stopTakeover };
}
