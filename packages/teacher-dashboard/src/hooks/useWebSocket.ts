import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "../stores/useStore";
import type { TelemetryData, AIAnalysis, StudentInfo } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:3001";

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useStore();

  useEffect(() => {
    const socket = io(WS_URL, {
      query: { role: "teacher" },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => store.setWsConnected(true));
    socket.on("disconnect", () => store.setWsConnected(false));

    socket.on("teacher:student-list", (students: Partial<StudentInfo>[]) => {
      students.forEach((s) => store.mergeStudent({ ...s, online: true } as StudentInfo));
    });

    socket.on("teacher:student-online", (student: Partial<StudentInfo>) => {
      store.mergeStudent({ ...student, online: true } as StudentInfo);
    });

    socket.on("teacher:student-offline", ({ studentId }: { studentId: string }) => {
      store.mergeStudent({ studentId, online: false } as StudentInfo);
    });

    socket.on("teacher:telemetry", ({ studentId, data }: { studentId: string; data: TelemetryData }) => {
      store.mergeStudent({ studentId, online: true, lastTelemetry: data });
    });

    socket.on("teacher:ai-analysis", ({ studentId, analysis }: { studentId: string; analysis: AIAnalysis }) => {
      store.setAnalysis(studentId, analysis);
    });

    socket.on("teacher:status-update", ({ studentId, takeoverActive }: { studentId: string; takeoverActive: boolean }) => {
      store.mergeStudent({ studentId, takeoverActive });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const requestAnalysis = (studentId: string) => {
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
