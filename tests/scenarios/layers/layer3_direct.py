#!/usr/bin/env python3
"""
Layer 3: 全量学生直接分析验证
直接 POST /analyze 给全部 30 个学生（不走 WS/Tracker 过滤），
验证每个学生的优先级是否符合场景预期。
"""
import json, sys, os, requests

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
AI_URL = "http://localhost:8000"

# 预期优先级: correct→low, missing_constraints→high, not_started→high, off_track→high/critical
EXPECTED = {}
for i in range(1, 11):
    EXPECTED[f"test_{i:02d}"] = {"scenario": "correct", "expected": ["low"]}
for i in range(11, 19):
    EXPECTED[f"test_{i:02d}"] = {"scenario": "missing_constraints", "expected": ["high", "medium"]}
for i in range(19, 26):
    EXPECTED[f"test_{i:02d}"] = {"scenario": "not_started", "expected": ["high", "critical"]}
for i in range(26, 31):
    EXPECTED[f"test_{i:02d}"] = {"scenario": "off_track", "expected": ["high", "critical"]}

results = []

for i in range(1, 31):
    path = os.path.join(ROOT, "students", f"student_{i:02d}.json")
    with open(path) as f:
        s = json.load(f)

    sid = s["student_no"]
    dsn = s["dsn"]
    telemetry = s["telemetry"]
    exp = EXPECTED[sid]

    try:
        resp = requests.post(f"{AI_URL}/analyze", json={
            "student_id": sid,
            "student_name": f"测试学生{i}",
            "telemetry": telemetry,
            "task_description": "",
            "student_dsn": dsn,
        }, timeout=120)

        ok = resp.status_code == 200
        if ok:
            data = resp.json()
            priority = data.get("priority", "?")
            diag = data.get("diagnosis", "")[:80]
            pass_ok = priority in exp["expected"]
            results.append({
                "student_id": sid,
                "scenario": exp["scenario"],
                "http": resp.status_code,
                "priority": priority,
                "expected": exp["expected"],
                "pass": pass_ok,
                "diagnosis": data.get("diagnosis", ""),
                "suggestion": data.get("suggestion", ""),
                "issues": data.get("issues", []),
            })
            status = "✅" if pass_ok else "❌"
            print(f"  {status} {sid} ({exp['scenario']}): priority={priority} (期望{exp['expected']})")
        else:
            results.append({
                "student_id": sid, "scenario": exp["scenario"],
                "http": resp.status_code, "priority": "ERROR", "expected": exp["expected"],
                "pass": False, "diagnosis": "", "suggestion": "", "issues": [],
            })
            print(f"  ❌ {sid}: HTTP {resp.status_code}")

    except Exception as e:
        results.append({
            "student_id": sid, "scenario": exp["scenario"],
            "http": 0, "priority": "EXCEPTION", "expected": exp["expected"],
            "pass": False, "diagnosis": str(e), "suggestion": "", "issues": [],
        })
        print(f"  ❌ {sid}: 异常 {e}")

passed = sum(1 for r in results if r["pass"])
total = len(results)
print(f"\n[layer3] {passed}/{total} 通过")

report = {"analyses": total, "passed": passed, "errors": total - passed, "details": results}
json.dump(report, open(os.path.join(ROOT, "layers", "layer3_report.json"), "w"), indent=2, ensure_ascii=False)
