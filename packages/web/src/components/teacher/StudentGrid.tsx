import { useState } from "react";
import { useStore } from "../../stores/useStore";
import type { StudentInfo } from "../../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  onAnalyze: (studentId: string) => void;
  onTakeover: (studentId: string) => void;
}

// 优先级标签样式映射
const priorityVariant: Record<string, "default" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
};

// 优先级中文标签映射
const priorityLabels: Record<string, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

// 学生卡片，显示状态、进度分析和操作按钮
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
  const analyzing = useStore((s) => s.analyzing[student.studentId]);
  const priority = analysis?.priority;
  const [expanded, setExpanded] = useState(false);
  const hasDetail = analysis?.diagnosis || analysis?.suggestion;
  const detailCount = [analysis?.diagnosis, analysis?.suggestion].filter(Boolean).length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${!student.online ? "bg-gray-200" : student.idle ? "bg-gray-400" : "bg-green-500"}`} />
            <span className="font-medium text-sm text-gray-900">{student.studentName}</span>
            <span className="text-xs text-gray-400">{student.studentId}</span>
          </div>
          {priority && (
            <Badge variant={priorityVariant[priority]}>{priorityLabels[priority]}</Badge>
          )}
        </div>

        {analysis?.progress && (
          <div className="mb-2">
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

        {hasDetail && (
          <div className="mb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            {analysis.diagnosis && (
              <p className={`text-xs text-gray-600 leading-relaxed ${!expanded ? "line-clamp-2" : ""}`}>
                <span className="text-gray-400 mr-1">诊断</span>
                {analysis.diagnosis}
              </p>
            )}
            {analysis.suggestion && (
              <p className={`text-xs text-gray-600 leading-relaxed mt-1 ${!expanded ? "line-clamp-2" : ""}`}>
                <span className="text-gray-400 mr-1">建议</span>
                {analysis.suggestion}
              </p>
            )}
            {detailCount > 1 && (
              <span className="text-xs text-gray-400 mt-1 block">{expanded ? "收起" : "..."}</span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant={analyzing ? "secondary" : "outline"} size="sm" className="flex-1" onClick={() => onAnalyze(student.studentId)} disabled={analyzing}>
            {analyzing ? "分析中..." : "分析"}
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

// 学生网格，按优先级排序展示所有学生卡片
export function StudentGrid({ onAnalyze, onTakeover }: Props) {
  const students = useStore((s) => s.students);
  const analyses = useStore((s) => s.analyses);

  const sorted = [...students].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    const pa = order[analyses[a.studentId]?.priority] ?? 4;
    const pb = order[analyses[b.studentId]?.priority] ?? 4;
    return pa - pb;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-medium text-gray-500 mb-4">
        所有学生
        <span className="ml-2 text-xs text-gray-400">({students.length})</span>
      </h2>
      {students.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">等待学生连接...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sorted.map((s) => (
            <StudentCard key={s.studentId} student={s} onAnalyze={onAnalyze} onTakeover={onTakeover} />
          ))}
        </div>
      )}
    </div>
  );
}
