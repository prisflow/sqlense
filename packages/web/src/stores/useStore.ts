import { create } from "zustand";
import type { StudentInfo, AIAnalysis } from "../types";

interface Store {
  students: StudentInfo[];
  analyses: Record<string, AIAnalysis>;
  analyzing: Record<string, boolean>;
  selectedStudentId: string | null;
  wsConnected: boolean;

  setStudents: (students: StudentInfo[]) => void;
  mergeStudent: (student: Partial<StudentInfo> & { studentId: string }) => void;
  setAnalysis: (studentId: string, analysis: AIAnalysis) => void;
  setAnalyzing: (studentId: string, loading: boolean) => void;
  setSelectedStudentId: (studentId: string | null) => void;
  setWsConnected: (connected: boolean) => void;
}

// 全局状态管理，管理学生列表、分析和连接状态
export const useStore = create<Store>((set) => ({
  students: [],
  analyses: {},
  analyzing: {},
  selectedStudentId: null,
  wsConnected: false,

  // 设置学生列表
  setStudents: (students) => {
    set({ students });
  },

  // 合并更新单个学生数据
  mergeStudent: (update) =>
    set((state) => {
      const exists = state.students.find((s) => s.studentId === update.studentId);
      if (exists) {
        return {
          students: state.students.map((s) =>
            s.studentId === update.studentId ? { ...s, ...update } : s
          ),
        };
      }
      return { students: [...state.students, update as StudentInfo] };
    }),

  // 设置学生 AI 分析结果
  setAnalysis: (studentId, analysis) =>
    set((state) => ({
      analyses: { ...state.analyses, [studentId]: analysis },
      analyzing: { ...state.analyzing, [studentId]: false },
    })),

  // 设置学生分析中加载状态
  setAnalyzing: (studentId, loading) =>
    set((state) => ({
      analyzing: { ...state.analyzing, [studentId]: loading },
    })),

  // 设置当前选中的学生 ID
  setSelectedStudentId: (studentId) => set({ selectedStudentId: studentId }),
  // 设置 WebSocket 连接状态
  setWsConnected: (connected) => set({ wsConnected: connected }),
}));

