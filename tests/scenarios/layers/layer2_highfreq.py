#!/usr/bin/env python3
import json, sys, os, time, asyncio
from socketio import Client

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
WS_URL = "http://localhost:3001"

# 加载差生数据，高频发送8条触发分析
async def run():
    with open(os.path.join(ROOT, "students", "student_26.json")) as f:
        student = json.load(f)

    sid = student["student_no"]
    events = student["telemetry"][:8]

    teacher = Client()
    analyses = []
    errors = []

    @teacher.on("teacher:ai-analysis")
    # 接收学生AI分析结果
    def on_analysis(data):
        analyses.append(data)
        a = data.get("analysis", {})
        print(f"  [分析] {data.get('studentId')}: priority={a.get('priority')}")
        diag = a.get("diagnosis", "")[:80]
        sug = a.get("suggestion", "")[:80]
        if diag:
            print(f"         诊断: {diag}...")
        if sug:
            print(f"         建议: {sug}...")

    @teacher.on("teacher:error")
    # 接收教师端错误事件
    def on_error(data):
        errors.append(data)
        print(f"  [错误] {data}")

    teacher.connect(f"{WS_URL}?role=teacher")

    student_client = Client()
    student_client.connect(f"{WS_URL}?role=student&studentId={sid}&studentName=测试{sid[-2:]}")
    await asyncio.sleep(1)

    # 10 秒内发 8 条（高频触发器 5条/10s）
    for i, evt in enumerate(events):
        evt["timestamp"] = time.time()
        student_client.emit("student:telemetry", evt)
        print(f"  [发送] {i+1}/{len(events)}")
        await asyncio.sleep(1.2)

    print("[layer2] 等待分析结果 (30s)...")
    await asyncio.sleep(30)

    student_client.disconnect()
    teacher.disconnect()

    print(f"\n[layer2] 收到分析: {len(analyses)}, 错误: {len(errors)}")
    return analyses, errors

# 主入口：执行单生高频测试并输出
if __name__ == "__main__":
    results = asyncio.run(run())
    details = []
    for r in results[0]:
        a = r.get("analysis", {})
        details.append({
            "student_id": r.get("studentId"),
            "priority": a.get("priority"),
            "diagnosis": a.get("diagnosis"),
            "suggestion": a.get("suggestion"),
            "issues": a.get("issues", []),
        })
    report = {"analyses": len(results[0]), "errors": len(results[1]), "details": details}
    print(json.dumps(report, indent=2))
    json.dump(report, open(os.path.join(ROOT, "layers", "layer2_report.json"), "w"), indent=2, ensure_ascii=False)
