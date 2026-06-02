import { create } from "zustand";
import type { StudentInfo, AIAnalysis } from "../types";

interface Store {
  students: StudentInfo[];
  analyses: Record<string, AIAnalysis>;
  selectedStudentId: string | null;
  wsConnected: boolean;

  setStudents: (students: StudentInfo[]) => void;
  mergeStudent: (student: Partial<StudentInfo> & { studentId: string }) => void;
  setAnalysis: (studentId: string, analysis: AIAnalysis) => void;
  setSelectedStudentId: (studentId: string | null) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useStore = create<Store>((set) => ({
  students: [],
  analyses: {},
  selectedStudentId: null,
  wsConnected: false,

  setStudents: (students) => {
    set({ students });
  },

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

  setAnalysis: (studentId, analysis) =>
    set((state) => ({
      analyses: { ...state.analyses, [studentId]: analysis },
    })),

  setSelectedStudentId: (studentId) => set({ selectedStudentId: studentId }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
}));
