import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import { useStore } from "../stores/useStore";
import type { TelemetryData, AIAnalysis, StudentInfo } from "../types";

function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

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

  const requestAnalysis = (studentId: string) => {
    store.setAnalyzing(studentId, true);
    socketRef.current?.emit("teacher:ai-query", { studentId });
  };

  const startTakeover = (studentId: string) => {
    socketRef.current?.emit("teacher:takeover", { studentId });
    store.setSelectedStudentId(studentId);
  };

  const stopTakeover = (studentId: string) => {
    socketRef.current?.emit("teacher:takeover-release", { studentId });
    store.setSelectedStudentId(null);
  };

  return { requestAnalysis, startTakeover, stopTakeover };
}
