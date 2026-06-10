import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

// 系统设置页面，管理日志和 AI 模型配置
export default function AdminSettings() {
  const [days, setDays] = useState("90");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then(r => r.json()).then(d => {
      if (d.settings?.log_retention_days) setDays(d.settings.log_retention_days);
      if (d.settings?.llm_api_key) setApiKey(d.settings.llm_api_key);
      if (d.settings?.llm_base_url) setBaseUrl(d.settings.llm_base_url);
      if (d.settings?.llm_model) setModel(d.settings.llm_model);
    }).catch(e => { console.error(e); toast.error("加载失败"); });
  }, []);

  // 保存日志保留天数设置
  const saveLogRetention = async () => {
    const n = Number(days);
    if (n < 1 || n > 365 || !Number.isInteger(n)) { toast.error("请输入 1-365 的整数"); return; }
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log_retention_days: n }),
    });
    if (res.ok) toast.success("已更新");
    else toast.error("保存失败");
  };

  // 保存 AI 模型参数配置
  const saveLlm = async () => {
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm_api_key: apiKey, llm_base_url: baseUrl, llm_model: model }),
    });
    if (res.ok) toast.success("已更新");
    else toast.error("保存失败");
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">系统设置</h1>

      <Card>
        <CardContent className="p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">日志保留天数</label>
          <div className="flex gap-3 items-center">
            <Input type="number" value={days} onChange={e => setDays(e.target.value)} min={1} max={365} className="w-32 text-gray-900" />
            <span className="text-sm text-gray-500">天（1-365）</span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">超过设定天数的日志将被自动清理，每小时执行一次。</p>
            <Button onClick={saveLogRetention}>保存</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-3">AI 模型配置</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="text-gray-900" placeholder="sk-xxx" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Base URL</label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="text-gray-900" placeholder="https://api.deepseek.com/v1" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Model</label>
              <Input value={model} onChange={e => setModel(e.target.value)} className="text-gray-900" placeholder="deepseek-chat" />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button onClick={saveLlm}>保存</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
