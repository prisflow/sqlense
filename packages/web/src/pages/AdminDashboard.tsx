import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

// 管理后台概览页，展示系统统计数据
export default function AdminDashboard() {
  const [data, setData] = useState({ classCount: 0, teacherCount: 0, studentCount: 0, logCount24h: 0, activeStudentCount: 0 });

  useEffect(() => {
    fetch("/api/admin/dashboard").then(r => r.json()).then(setData).catch(e => { console.error(e); toast.error("加载失败"); });
  }, []);

  const cards = [
    { label: "班级", value: data.classCount },
    { label: "教师", value: data.teacherCount },
    { label: "学生", value: data.studentCount },
    { label: "运行中", value: data.activeStudentCount },
    { label: "今日日志", value: data.logCount24h },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">概览</h1>
      <div className="grid grid-cols-5 gap-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5">
              <div className="text-sm text-gray-700 mb-2 font-medium">{c.label}</div>
              <div className="text-3xl font-semibold text-gray-900">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
