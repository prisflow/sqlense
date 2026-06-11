import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// 管理后台概览页，展示系统统计数据
export default function AdminDashboard() {
  const [data, setData] = useState<{ classCount: number; teacherCount: number; studentCount: number; logCount24h: number; activeStudentCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard").then(r => r.json()).then(setData).catch(e => { console.error(e); toast.error("加载失败"); });
  }, []);

  const labels = ["班级", "教师", "学生", "运行中", "今日日志"];

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">概览</h1>
      <div className="grid grid-cols-5 gap-5">
        {labels.map((label) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="text-sm text-gray-700 mb-2 font-medium">{label}</div>
              {data ? (
                <div className="text-3xl font-semibold text-gray-900">
                  {label === "班级" ? data.classCount
                    : label === "教师" ? data.teacherCount
                    : label === "学生" ? data.studentCount
                    : label === "运行中" ? data.activeStudentCount
                    : data.logCount24h}
                </div>
              ) : (
                <Skeleton className="h-9 w-16" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
