import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";

interface Teacher { id: string; username: string; display_name: string; created_at: string; }

// 教师管理页面，支持增删教师账号
export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [u, setU] = useState({ username: "", password: "", displayName: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/admin/teachers").then(r => r.json()).then(d => { setTeachers(d.teachers); setLoading(false); }).catch(e => { console.error(e); toast.error("加载失败"); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  // 创建新教师账号
  const create = async () => {
    if (!u.username || !u.password || !u.displayName) return;
    const res = await fetch("/api/admin/teachers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) });
    if (!res.ok) { toast.error((await res.json()).error); return; }
    setU({ username: "", password: "", displayName: "" }); setOpen(false); load();
  };

  // 删除教师账号并解绑班级
  const remove = async (id: string) => {
    await fetch(`/api/admin/teachers/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">教师管理</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm">添加教师</Button>} />
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
      {loading ? (
        <TableSkeleton cols={4} rows={5} />
      ) : teachers.length === 0 ? (
        <div className="text-center text-gray-500 py-12">暂无教师</div>
      ) : (
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
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-red-600 text-xs">删除</Button>} />
                  <AlertDialogContent>
                    <AlertDialogTitle>确认删除？</AlertDialogTitle>
                    <AlertDialogDescription>该教师管理的班级将变为未指定班主任。</AlertDialogDescription>
                    <div className="flex justify-end gap-2 mt-4">
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(t.id)}>删除</AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}
    </div>
  );
}
