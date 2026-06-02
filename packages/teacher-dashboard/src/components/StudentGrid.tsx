import { useStore } from "../stores/useStore";
import type { StudentInfo } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  onAnalyze: (studentId: string) => void;
  onTakeover: (studentId: string) => void;
}

const priorityVariant: Record<string, "default" | "destructive" | "outline"> = {
  high: "destructive",
  medium: "default",
  low: "outline",
};

const priorityLabels: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function StudentCard({
  student,
  onAnalyze,
  onTakeover,
}: {
  student: StudentInfo;
  onAnalyze: (id: string) => void;
  onTakeover: (id: string) => void;
}) {
  const analysis = useStore((s) => s.analyses[student.studentId]);
  const priority = analysis?.priority;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${student.online ? "bg-green-500" : "bg-gray-300"}`} />
            <span className="font-medium text-sm text-gray-900">{student.studentName}</span>
            <span className="text-xs text-gray-400">{student.studentId}</span>
          </div>
          {priority && (
            <Badge variant={priorityVariant[priority]}>{priorityLabels[priority]}</Badge>
          )}
        </div>

        {analysis?.progress && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>进度</span>
              <span>{Math.round(analysis.progress.current_pct * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(analysis.progress.current_pct * 100))}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{analysis.progress.message}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onAnalyze(student.studentId)}>
            AI 分析
          </Button>
          <Button
            variant={student.takeoverActive ? "destructive" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => onTakeover(student.studentId)}
            disabled={student.takeoverActive}
          >
            {student.takeoverActive ? "已被接管" : "接管"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StudentGrid({ onAnalyze, onTakeover }: Props) {
  const students = useStore((s) => s.students);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-medium text-gray-500 mb-4">
        在线学生
        <span className="ml-2 text-xs text-gray-400">({students.length})</span>
      </h2>
      {students.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">等待学生连接...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {students.map((s) => (
            <StudentCard key={s.studentId} student={s} onAnalyze={onAnalyze} onTakeover={onTakeover} />
          ))}
        </div>
      )}
    </div>
  );
}
