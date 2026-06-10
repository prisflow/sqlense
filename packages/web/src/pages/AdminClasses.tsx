import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface ClassItem { id: string; name: string; created_at: string; teacher_id: string | null; teacher_name: string | null; }
interface Teacher { id: string; display_name: string; }

// 班级管理页面，支持增删改查
export default function AdminClasses() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  // 加载班级和教师列表数据
  const load = () => {
    fetch("/api/admin/classes").then(r => r.json()).then(d => setClasses(d.classes)).catch(e => { console.error(e); toast.error("加载失败"); });
    fetch("/api/admin/teachers").then(r => r.json()).then(d => setTeachers(d.teachers)).catch(e => { console.error(e); toast.error("加载失败"); });
  };
  useEffect(() => { load(); }, []);

  // 创建新班级
  const create = async () => {
    if (!name) return;
    await fetch("/api/admin/classes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teacher_id: teacherId || null }),
    });
    setName(""); setTeacherId(""); setOpen(false); load();
  };

  // 修改班级的班主任
  const editTeacher = async (classId: string, tid: string | null) => {
    await fetch(`/api/admin/classes/${classId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_id: tid }),
    });
    load();
  };

  // 删除班级及其关联数据
  const remove = async (id: string) => {
    await fetch(`/api/admin/classes/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">班级管理</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm">新建班级</Button>} />
          <DialogContent>
            <DialogTitle>新建班级</DialogTitle>
            <div className="space-y-3">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="班级名称" className="text-gray-900" onKeyDown={e => e.key === "Enter" && create()} />
              <Select value={teacherId} onValueChange={v => setTeacherId(v ?? "")} items={[{label:"不指定",value:""},...teachers.map(t=>({label:t.display_name,value:t.id}))]}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>选择班主任</SelectLabel>
                    <SelectItem value="">不指定</SelectItem>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={create}>创建</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>班主任</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-medium text-gray-900">{c.name}</TableCell>
              <TableCell>
                <Select value={c.teacher_id ?? ""} onValueChange={v => editTeacher(c.id, v)} items={[{label:"未指定",value:""},...teachers.map(t=>({label:t.display_name,value:t.id}))]}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>班主任</SelectLabel>
                      <SelectItem value="">未指定</SelectItem>
                      {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-gray-700">{new Date(c.created_at).toLocaleDateString("zh-CN")}</TableCell>
              <TableCell>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-red-600 text-xs">删除</Button>} />
                  <AlertDialogContent>
                    <AlertDialogTitle>确认删除？</AlertDialogTitle>
                    <AlertDialogDescription>关联的学生、容器和数据库都将被清除，此操作不可恢复。</AlertDialogDescription>
                    <div className="flex justify-end gap-2 mt-4">
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(c.id)}>删除</AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
