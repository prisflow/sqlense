import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface Student { id: string; display_name: string; student_no: string; status: string; class_name: string; cs_port: number; }
interface ClassItem { id: string; name: string; }

export default function AdminStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [classId, setClassId] = useState("");
  const [result, setResult] = useState("");

  const load = () => fetch("/api/admin/students").then(r => r.json()).then(d => setStudents(d.students)).catch(e => { console.error(e); toast.error("加载失败"); });
  const loadClasses = () => fetch("/api/admin/classes").then(r => r.json()).then(d => setClasses(d.classes)).catch(e => { console.error(e); toast.error("加载失败"); });
  useEffect(() => { load(); loadClasses(); }, []);

  const toggle = async (id: string, status: string) => {
    const s = status === "active" ? "disabled" : "active";
    await fetch(`/api/admin/students/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    load();
  };

  const importCsv = async () => {
    if (!csvText || !classId) return;
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length > 0 && lines[0].includes("student_no")) lines.shift();
    const data = lines.map(l => { const [a, b, c] = l.split(",").map(s => s.trim()); return { student_no: a, display_name: b, password: c, class_id: classId }; });
    const res = await fetch("/api/admin/students/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ students: data }) });
    const d = await res.json();
    const ok = d.results.filter((r: any) => r.status === "ok").length;
    const err = d.results.filter((r: any) => r.status === "error").length;
    setCsvText("");
    load();
    if (err === 0) { setOpen(false); setResult(""); }
    else { setResult(`成功 ${ok} 人，失败 ${err} 人`); }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/students/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">学生管理</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(""); }}>
          <DialogTrigger asChild>
            <Button size="sm">CSV 导入</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>CSV 导入学生</DialogTitle>
            <div className="space-y-3">
              <Select value={classId} onValueChange={setClassId} items={classes.map(c => ({ label: c.name, value: c.id }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择班级" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>班级</SelectLabel>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder={"student_no,display_name,password\n2024101,张三,pass101"} rows={6} className="text-gray-900" />
            </div>
            {result && <p className="text-sm text-gray-800 mt-2 font-medium">{result}</p>}
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>关闭</Button>
              <Button onClick={importCsv}>导入</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>学号</TableHead>
            <TableHead>班级</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>端口</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map(s => (
            <TableRow key={s.id}>
              <TableCell className="font-medium text-gray-900">{s.display_name}</TableCell>
              <TableCell className="text-gray-700">{s.student_no}</TableCell>
              <TableCell className="text-gray-700">{s.class_name}</TableCell>
              <TableCell><Badge variant={s.status === "active" ? "outline" : "destructive"}>{s.status === "active" ? "正常" : "禁用"}</Badge></TableCell>
              <TableCell className="text-gray-600 text-xs">{s.cs_port}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <button onClick={() => toggle(s.id, s.status)} className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2">
                    {s.status === "active" ? "禁用" : "启用"}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-sm text-red-600 hover:text-red-800 underline underline-offset-2">删除</button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogTitle>确认删除？</AlertDialogTitle>
                      <AlertDialogDescription>此操作不可恢复，将清除容器和数据库。</AlertDialogDescription>
                      <div className="flex justify-end gap-2 mt-4">
                        <AlertDialogCancel asChild>
                          <Button variant="outline">取消</Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button onClick={() => remove(s.id)}>删除</Button>
                        </AlertDialogAction>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
