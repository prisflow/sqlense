import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface LogEntry { id: string; username: string; role: string; action: string; detail: Record<string, unknown>; created_at: string; }

const actionLabels: Record<string, string> = {
  login: "登录", logout: "登出", create_class: "创建班级", delete_class: "删除班级",
  create_teacher: "创建教师", delete_teacher: "删除教师",
  import_students: "导入学生", disable_student: "禁用学生", enable_student: "启用学生", delete_student: "删除学生", upload_file: "上传文件",
};

const actionColors: Record<string, "outline" | "destructive"> = {
  login: "outline", create_class: "outline", import_students: "outline", enable_student: "outline", upload_file: "outline",
  delete_class: "destructive", delete_teacher: "destructive", disable_student: "destructive", delete_student: "destructive",
};

const actionItems = [
  { label: "全部操作", value: "all" },
  ...Object.entries(actionLabels).map(([k, v]) => ({ label: v, value: k })),
];

const dayItems = [
  { label: "最近 1 天", value: "1" },
  { label: "最近 7 天", value: "7" },
  { label: "最近 30 天", value: "30" },
];

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState("all");
  const [days, setDays] = useState("1");

  const load = () => {
    const p = new URLSearchParams();
    if (actionFilter && actionFilter !== "all") p.set("action", actionFilter);
    p.set("days", days);
    fetch(`/api/admin/logs?${p}`).then(r => r.json()).then(d => setLogs(d.logs)).catch(e => { console.error(e); toast.error("加载失败"); });
  };
  useEffect(() => { load(); }, [actionFilter, days]);

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">操作日志</h1>
      <div className="flex gap-3 mb-4">
        <Select items={actionItems} value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>筛选操作</SelectLabel>
              {actionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select items={dayItems} value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>时间范围</SelectLabel>
              {dayItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>操作</TableHead>
            <TableHead>详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(l => (
            <TableRow key={l.id}>
              <TableCell className="text-gray-700 text-xs">{new Date(l.created_at).toLocaleString("zh-CN")}</TableCell>
              <TableCell className="font-medium text-gray-900">{l.username}</TableCell>
              <TableCell><Badge variant="outline">{l.role}</Badge></TableCell>
              <TableCell><Badge variant={actionColors[l.action] || "outline"}>{actionLabels[l.action] || l.action}</Badge></TableCell>
              <TableCell className="text-gray-700 text-xs max-w-xs truncate">{JSON.stringify(l.detail)}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">暂无日志</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
