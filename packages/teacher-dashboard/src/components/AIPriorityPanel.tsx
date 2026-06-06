import { useStore } from "../stores/useStore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function AIPriorityPanel() {
  const students = useStore((s) => s.students);
  const analyses = useStore((s) => s.analyses);

  const sortedStudents = [...students].sort((a, b) => {
    const pa = analyses[a.studentId]?.priority || "low";
    const pb = analyses[b.studentId]?.priority || "low";
    const order = { high: 0, medium: 1, low: 2 };
    return order[pa] - order[pb];
  });

  const priorityBadge: Record<string, "destructive" | "default" | "outline"> = {
    high: "destructive",
    medium: "default",
    low: "outline",
  };

  const priorityLabel: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
  };

  return (
    <div className="p-4 overflow-y-auto max-h-96">
      <h3 className="text-sm font-medium text-gray-700 mb-3">AI 优先级分析</h3>
      {sortedStudents.length === 0 ? (
        <p className="text-xs text-gray-400">暂无数据</p>
      ) : (
        <div className="space-y-2">
          {sortedStudents.map((s) => {
            const analysis = analyses[s.studentId];
            if (!analysis) return null;
            return (
              <Card key={s.studentId}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-900">{s.studentName}</span>
                    <Badge variant={priorityBadge[analysis.priority]}>{priorityLabel[analysis.priority]}</Badge>
                  </div>
                  {analysis.diagnosis && (
                    <div className="text-xs text-gray-600 leading-relaxed max-h-24 overflow-y-auto scrollbar-thin">
                      {analysis.diagnosis}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
