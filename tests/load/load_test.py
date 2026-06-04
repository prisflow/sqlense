"""
SQLense 负载测试主脚本

用法:
  python tests/load/load_test.py --students 50 --events 30 --interval 0.2 --ramp 2

需要前置:
  - docker compose 所有服务正常运行
  - AI gateway 已配置 LLM API key
  - admin / admin 登录可用
"""

import argparse
import asyncio
import json
import time
import sys
import subprocess
from socketio import Client
from dataset import generate_multi_student

WS_URL = "http://localhost:3001"
API_URL = "http://localhost:4000"
REPORT = {}


async def load_test(students: int, events_per: int, interval: float, ramp: int):
    print(f"[load] 启动负载测试: {students} 学生 × {events_per} 事件, "
          f"间隔 {interval}s, ramp-up {ramp}s/学生")
    print(f"[load] 预计总事件: {students * events_per}")

    dataset = generate_multi_student(students, events_per)
    total_events = sum(len(v) for v in dataset.values())
    print(f"[load] 数据集生成完毕: {len(dataset)} 学生, {total_events} 事件")

    # 连接教师端收集分析结果
    teacher = Client()
    teacher_results = []
    teacher_errors = []

    @teacher.on("teacher:ai-analysis")
    def on_analysis(data):
        teacher_results.append(data)

    @teacher.on("teacher:error")
    def on_error(data):
        teacher_errors.append(data)

    teacher.connect(f"{WS_URL}?role=teacher")
    await asyncio.sleep(1)

    # 逐个启动学生连接并发送 telemetry
    student_clients = []
    sent_count = 0
    start_time = time.time()

    for idx, (sid, events) in enumerate(dataset.items()):
        await asyncio.sleep(ramp)  # ramp-up
        try:
            client = Client()
            client.connect(f"{WS_URL}?role=student&studentId={sid}&studentName=学生{sid[-4:]}")
            student_clients.append(client)
            await asyncio.sleep(0.5)

            for evt in events:
                client.emit("student:telemetry", evt)
                sent_count += 1
                await asyncio.sleep(interval)

            print(f"[load] [{idx+1}/{students}] {sid}: {len(events)} 条已发送")

        except Exception as e:
            print(f"[load] 学生 {sid} 连接失败: {e}")

    elapsed = time.time() - start_time
    print(f"\n[load] 发送完毕: {sent_count}/{total_events} 条, 耗时 {elapsed:.0f}s")

    # 等待分析完成
    print("[load] 等待分析结果 (60s)...")
    await asyncio.sleep(60)

    # 收集 docker stats
    stats = {}
    try:
        out = subprocess.run(
            ["docker", "stats", "--no-stream", "--format",
             "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"],
            capture_output=True, text=True, timeout=10
        )
        for line in out.stdout.strip().split("\n"):
            parts = line.split("\t")
            if len(parts) == 3:
                name = parts[0].replace("sqlense-", "").replace("-1", "")
                stats[name] = {"cpu": parts[1], "mem": parts[2]}
    except:
        pass

    # 采集 AI gateway 日志用量
    agent_usage = []
    try:
        log_out = subprocess.run(
            ["docker", "compose", "logs", "ai-gateway"],
            capture_output=True, text=True, timeout=10,
            cwd="/home/tobegold574/sqlense",
        )
        for line in log_out.stdout.split("\n"):
            if "[usage]" in line:
                agent_usage.append(line.strip())
    except:
        pass

    # 清理
    for c in student_clients:
        try:
            c.disconnect()
        except:
            pass
    teacher.disconnect()

    # 报告
    REPORT["students"] = students
    REPORT["events_per_student"] = events_per
    REPORT["total_events_sent"] = sent_count
    REPORT["elapsed_seconds"] = round(elapsed, 1)
    REPORT["events_per_second"] = round(sent_count / elapsed, 1) if elapsed > 0 else 0
    REPORT["teacher:ai-analysis_count"] = len(teacher_results)
    REPORT["teacher:error_count"] = len(teacher_errors)
    REPORT["teacher_errors"] = [str(e) for e in teacher_errors[:10]]
    REPORT["analysis_ids"] = [r.get("studentId") for r in teacher_results]
    REPORT["docker_stats"] = stats
    REPORT["agent_usage_lines"] = agent_usage[-20:] if agent_usage else []

    print()
    print("=" * 60)
    print("负载测试报告")
    print("=" * 60)
    print(f"学生数:         {REPORT['students']}")
    print(f"总事件数:       {REPORT['total_events_sent']}")
    print(f"耗时:           {REPORT['elapsed_seconds']}s")
    print(f"发送速率:       {REPORT['events_per_second']} 条/s")
    print(f"收到分析结果:   {REPORT['teacher:ai-analysis_count']}")
    print(f"错误数:         {REPORT['teacher:error_count']}")
    if stats:
        print(f"\n容器资源:")
        for name, s in stats.items():
            print(f"  {name}: CPU={s['cpu']}  MEM={s['mem']}")
    if agent_usage:
        usage_counts = [l for l in agent_usage if "requests" in l]
        print(f"\nAI 网关用量 (最后 {len(usage_counts)} 次):")
        for l in usage_counts[-10:]:
            print(f"  {l}")


def main():
    parser = argparse.ArgumentParser(description="SQLense 负载测试")
    parser.add_argument("--students", type=int, default=20, help="模拟学生数")
    parser.add_argument("--events", type=int, default=30, help="每人事件数")
    parser.add_argument("--interval", type=float, default=0.2, help="事件间隔(秒)")
    parser.add_argument("--ramp", type=int, default=2, help="学生启动间隔(秒)")
    parser.add_argument("--output", default="", help="报告输出路径")
    args = parser.parse_args()

    asyncio.run(load_test(args.students, args.events, args.interval, args.ramp))

    if args.output:
        with open(args.output, "w") as f:
            json.dump(REPORT, f, indent=2, ensure_ascii=False)
        print(f"\n报告已保存: {args.output}")


if __name__ == "__main__":
    main()
