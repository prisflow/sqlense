import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface Teacher { id: string; username: string; display_name: string; created_at: string; }

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [open, setOpen] = useState(false);
  const [u, setU] = useState({ username: "", password: "", displayName: "" });

  const load = () => fetch("/api/admin/teachers").then(r => r.json()).then(d => setTeachers(d.teachers)).catch(e => { console.error(e); toast.error("加载失败"); });
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!u.username || !u.password || !u.displayName) return;
    const res = await fetch("/api/admin/teachers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) });
    if (!res.ok) { toast.error((await res.json()).error); return; }
    setU({ username: "", password: "", displayName: "" }); setOpen(false); load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/teachers/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">教师管理</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">添加教师</Button>
          </DialogTrigger>
          <DialogContent className="text-gray-900">
            <DialogTitle className="text-gray-900">添加教师</DialogTitle>
            <div className="space-y-3">
              <Input value={u.displayName} onChange={e => setU({ ...u, displayName: e.target.value })} placeholder="姓名" className="text-gray-900" />
              <Input value={u.username} onChange={e => setU({ ...u, username: e.target.value })} placeholder="登录账号" className="text-gray-900" />
              <Input type="password" value={u.password} onChange={e => setU({ ...u, password: e.target.value })} placeholder="密码" className="text-gray-900" />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={create}>添加</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>账号</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map(t => (
            <TableRow key={t.id}>
              <TableCell className="font-medium text-gray-900">{t.display_name}</TableCell>
              <TableCell><Badge variant="outline" className="text-gray-700">{t.username}</Badge></TableCell>
              <TableCell className="text-gray-700">{new Date(t.created_at).toLocaleDateString("zh-CN")}</TableCell>
              <TableCell>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-red-600 text-xs">删除</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>确认删除？</AlertDialogTitle>
                    <AlertDialogDescription>该教师管理的班级将变为未指定班主任。</AlertDialogDescription>
                    <div className="flex justify-end gap-2 mt-4">
                      <AlertDialogCancel asChild>
                        <Button variant="outline">取消</Button>
                      </AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button onClick={() => remove(t.id)}>删除</Button>
                      </AlertDialogAction>
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
