#!/usr/bin/env python3
import json, sys, os, time, asyncio
from socketio import Client

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
WS_URL = "http://localhost:3001"

# 加载30个学生数据，各取3-4条发送
async def run():
    # 加载所有学生数据
    events_batch = []
    for i in range(1, 31):
        path = os.path.join(ROOT, "students", f"student_{i:02d}.json")
        with open(path) as f:
            s = json.load(f)
        # 每人取 3-4 条
        pick = s["telemetry"][:4]
        for evt in pick:
            evt["timestamp"] = time.time()
            events_batch.append((s["student_no"], evt))

    print(f"[layer1] {len(events_batch)} 条事件, {len(set(e[0] for e in events_batch))} 个学生")

    teacher = Client()
    analyses = []
    errors = []

    @teacher.on("teacher:ai-analysis")
    # 收到AI分析结果并打印
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
    # 收到教师端错误消息
    def on_error(data):
        errors.append(data)
        print(f"  [错误] {data}")

    teacher.connect(f"{WS_URL}?role=teacher")
    await asyncio.sleep(1)

    # 所有学生连 WS
    students = {}
    for sid in set(e[0] for e in events_batch):
        c = Client()
        c.connect(f"{WS_URL}?role=student&studentId={sid}&studentName=测试{sid[-2:]}")
        students[sid] = c
        await asyncio.sleep(0.1)

    await asyncio.sleep(1)

    # 发送事件（间隔短，确保不会触发单个学生的高频）
    for sid, evt in events_batch:
        students[sid].emit("student:telemetry", evt)
        await asyncio.sleep(0.05)

    print("[layer1] 等待分析结果 (45s)...")
    await asyncio.sleep(45)

    # 清理
    for c in students.values():
        c.disconnect()
    teacher.disconnect()

    print(f"\n[layer1] 收到分析: {len(analyses)}, 错误: {len(errors)}")
    return analyses, errors

# 主入口：执行测试并输出报告
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
    json.dump(report, open(os.path.join(ROOT, "layers", "layer1_report.json"), "w"), indent=2, ensure_ascii=False)
