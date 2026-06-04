# 测试方案

## 测试层次

```
层级 1: 单元测试 ─ 单个函数/方法正确性
层级 2: 集成测试 ─ 跨容器数据流闭环
层级 3: 负载测试 ─ 并发压力 + 稳定性
```

---

## 层级 1: 单元测试

### 测试对象: TelemetryTracker (TypeScript)

**前置**: 安装 vitest

```bash
cd packages/websocket-server
npm install -D vitest
```

**测试文件**: `src/telemetryTracker.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { TelemetryTracker } from "./telemetryTracker";

function makeEvent(type: string) {
  return { type, timestamp: Date.now() };
}

describe("TelemetryTracker", () => {
  it("单生高频 6 条/10s 触发 flushStudent", () => {
    const flush = vi.fn();
    const tracker = new TelemetryTracker(
      { highFreqWindowMs: 10_000, highFreqThreshold: 5, globalBatchThreshold: 100 },
      flush
    );

    for (let i = 0; i < 6; i++) {
      tracker.record("s1", makeEvent("terminal"));
    }

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(
      expect.objectContaining({ type: "student", studentId: "s1" })
    );
  });

  it("低频 4 条/10s 不触发 flushStudent", () => {
    const flush = vi.fn();
    const tracker = new TelemetryTracker(
      { highFreqWindowMs: 10_000, highFreqThreshold: 5, globalBatchThreshold: 100 },
      flush
    );

    for (let i = 0; i < 4; i++) {
      tracker.record("s1", makeEvent("terminal"));
    }

    expect(flush).not.toHaveBeenCalled();
  });

  it("全局累计 100 条触发 flushGlobal", () => {
    const flush = vi.fn((e) => {
      if (e.type === "global") expect(e.entries.length).toBeGreaterThan(0);
    });
    const tracker = new TelemetryTracker(
      { highFreqWindowMs: 10_000, highFreqThreshold: 5, globalBatchThreshold: 100 },
      flush
    );

    // 3 个学生各发 34 条 = 102
    for (let i = 0; i < 34; i++) {
      tracker.record("s1", makeEvent("terminal"));
      tracker.record("s2", makeEvent("terminal"));
      tracker.record("s3", makeEvent("terminal"));
    }

    expect(flush).toHaveBeenCalledWith(
      expect.objectContaining({ type: "global" })
    );
  });

  it("buffer 不超过 500 条上限", () => {
    const flush = vi.fn();
    const tracker = new TelemetryTracker(
      { highFreqWindowMs: 10_000, highFreqThreshold: 5, globalBatchThreshold: 100 },
      flush
    );

    for (let i = 0; i < 600; i++) {
      tracker.record("s1", makeEvent("terminal"));
    }

    expect(tracker.getStudentBuffer("s1").length).toBeLessThanOrEqual(500);
  });

  it("idle 事件不触发任何 flush", () => {
    const flush = vi.fn();
    const tracker = new TelemetryTracker(
      { highFreqWindowMs: 10_000, highFreqThreshold: 5, globalBatchThreshold: 3 },
      flush
    );

    tracker.record("s1", makeEvent("idle"));
    tracker.record("s1", makeEvent("idle"));
    tracker.record("s1", makeEvent("idle"));
    tracker.record("s1", makeEvent("idle"));

    expect(flush).not.toHaveBeenCalled();
  });
});
```

**运行**:

```bash
npx vitest run src/telemetryTracker.test.ts
```

### 测试对象: PriorityScorer (Python)

**前置**: 安装 pytest

```bash
cd ai-gateway
pip install pytest 2>/dev/null
```

**测试文件**: `tests/test_priority.py`

```python
import pytest
from analyzers.priority import PriorityScorer
from schemas.models import PriorityLevel, ProgressMetrics

scorer = PriorityScorer()

def test_critical():
    m = ProgressMetrics(errors=5, last_action_ago=180, idle_seconds=200, started=True)
    assert scorer.score(m) == PriorityLevel.CRITICAL

def test_low():
    m = ProgressMetrics(errors=0, last_action_ago=10, idle_seconds=0, started=True, current_pct=0.9)
    assert scorer.score(m) == PriorityLevel.LOW

def test_medium_not_started():
    m = ProgressMetrics(errors=0, last_action_ago=10, idle_seconds=0, started=False)
    assert scorer.score(m) == PriorityLevel.MEDIUM

def test_high_errors():
    m = ProgressMetrics(errors=3, last_action_ago=30, idle_seconds=10, started=True)
    assert scorer.score(m) == PriorityLevel.HIGH
```

**运行**:

```bash
pytest tests/test_priority.py -v
```

---

## 层级 2: 集成测试

### 前置条件

- 所有 7 个容器正常运行 (`docker compose ps`)
- AI gateway 已配置 LLM API key（后台设置或环境变量）
- 基础数据已导入（用户的 seed.sql）

### 环境变量

```
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

### 测试场景 A: 高频自动分析

**目的**: 验证学生发送高频 telemetry 后自动触发 /analyze 并推送到教师端

**测试脚本**: `tests/integration/test_high_freq.py`

```python
import asyncio, json, time
from socketio import Client

WS_URL = "http://localhost:3001"
AI_URL = "http://localhost:8000"

async def test_auto_analyze():
    teacher = Client()
    student = Client()

    teacher_results = []

    @teacher.on("teacher:ai-analysis")
    def on_analysis(data):
        teacher_results.append(data)

    teacher.connect(WS_URL, query="role=teacher")
    student.connect(WS_URL, query="role=student&studentId=2024001&studentName=张三")

    await asyncio.sleep(1)  # wait for connect

    # Send 6 terminal errors within 10 seconds
    for i in range(6):
        student.emit("student:telemetry", {
            "type": "terminal",
            "timestamp": time.time(),
            "payload": {"output": f"ERROR: syntax error at line {i+1}"},
        })
        await asyncio.sleep(1.5)

    await asyncio.sleep(10)  # wait for AI analysis

    assert len(teacher_results) >= 1, "未收到 teacher:ai-analysis"
    r = teacher_results[0]
    assert r["studentId"] == "2024001"
    assert r["analysis"]["priority"] in ("critical", "high", "medium", "low")

    teacher.disconnect()
    student.disconnect()
    print("[PASS] 高频自动分析")

asyncio.run(test_auto_analyze())
```

**运行**:

```bash
pip install python-socketio[asyncio_client]
python tests/integration/test_high_freq.py
```

**预期结果**:

| 检查项 | 预期 |
|--------|------|
| WS 收到 `teacher:ai-analysis` | 是 |
| priority 字段合法 | 是 |
| diagnosis 不为空 | 是 |
| ai-gateway 日志无报错 | 是 |
| SQL Agent 成功连学生 DB | ai-gateway 日志可见 `execute_query` |

### 测试场景 B: 全局 Batch 过滤

**目的**: 验证 100 条混合 telemetry 触发 batch，只有异常学生被推送

**测试脚本**: `tests/integration/test_batch_filter.py`

```python
import asyncio, time
from socketio import Client

WS_URL = "http://localhost:3001"

async def test_batch_filter():
    teacher = Client()
    student_a = Client()  # 有报错
    student_b = Client()  # 只有 idle

    analyzed_students = []

    @teacher.on("teacher:ai-analysis")
    def on_analysis(data):
        analyzed_students.append(data["studentId"])

    teacher.connect(WS_URL, query="role=teacher")
    student_a.connect(WS_URL, query="role=student&studentId=2024001&studentName=张三")
    student_b.connect(WS_URL, query="role=student&studentId=2024002&studentName=李四")

    await asyncio.sleep(1)

    # student_a 发 60 条报错
    for i in range(60):
        student_a.emit("student:telemetry", {
            "type": "error",
            "timestamp": time.time(),
            "payload": {"code": "SELECT * FORM students", "codeHistory": []},
        })
        await asyncio.sleep(0.1)

    # student_b 发 60 条 idle
    for i in range(60):
        student_b.emit("student:telemetry", {
            "type": "idle",
            "timestamp": time.time(),
            "payload": {"duration": 200},
        })
        await asyncio.sleep(0.1)

    await asyncio.sleep(15)  # wait for batch + analysis

    assert "2024001" in analyzed_students, "有报错的学生应被分析"
    assert "2024002" not in analyzed_students, "只有 idle 的学生应被过滤"

    teacher.disconnect()
    student_a.disconnect()
    student_b.disconnect()
    print("[PASS] Batch 过滤")

asyncio.run(test_batch_filter())
```

**预期结果**:

| 检查项 | 预期 |
|--------|------|
| 2024001 被分析 | 是 |
| 2024002 被过滤 | 是 |

### 测试场景 C: 无 LLM Key 回退

**目的**: 验证未配置 LLM 时系统不崩溃，使用规则引擎

**测试脚本**: `tests/integration/test_fallback.py`

```python
import requests

AI_URL = "http://localhost:8000"

resp = requests.post(f"{AI_URL}/analyze", json={
    "student_id": "2024001",
    "student_name": "张三",
    "telemetry": [
        {
            "type": "error",
            "timestamp": 1700000000,
            "payload": {"source": "diagnostics", "errors": [{"line": 3, "message": "syntax error"}]},
        },
        {
            "type": "error",
            "timestamp": 1700000001,
            "payload": {"code": "CREATE TABLE students (", "codeHistory": []},
        },
        {
            "type": "terminal",
            "timestamp": 1700000002,
            "payload": {"output": "ERROR: syntax error at or near 'CREATE'"},
        },
    ],
    "task_description": "",
    "student_dsn": "",
})

assert resp.status_code == 200
data = resp.json()
assert data["priority"] in ("critical", "high", "medium", "low")
print(f"[PASS] 无 LLM 回退，优先级: {data['priority']}")
```

**预期结果**:

| 检查项 | 预期 |
|--------|------|
| HTTP 200 | 是 |
| priority 存在 | 是 |
| 无 LLM 相关报错 | 是 |

### 测试场景 D: 教师手动分析

**手动流程**:

1. 打开 `http://localhost:3000` → 登录 `teacher / teacher`
2. 学生卡片列表可见在线学生
3. 点击学生卡片的 "AI 分析" 按钮
4. 等待分析结果出现在卡片上
5. 验证优先级标签显示正确

---

## 层级 3: 负载测试

### 测试对象

- WebSocket 服务器（端口 3001）
- AI Gateway（端口 8000）

### 前置条件

- 实际 LLM API key 已配置
- 并发模拟脚本

### 测试脚本: `tests/load/locustfile.py`

```python
import time, random
from locust import task, between
from websocket import create_connection

class StudentBehavior:
    ws_url = "ws://localhost:3001"
    student_id = 2024001

    def on_start(self):
        self.ws = create_connection(
            f"{self.ws_url}?role=student&studentId={self.student_id}&studentName=测试"
        )
        self.student_id += 1

    @task
    def send_telemetry(self):
        self.ws.send(json.dumps({
            "type": random.choice(["terminal", "error"]),
            "timestamp": time.time(),
            "payload": {"output": "ERROR: syntax error", "code": "SELECT *", "codeHistory": []},
        }))
        time.sleep(random.uniform(1, 3))

    def on_stop(self):
        self.ws.close()
```

**运行**:

```bash
pip install locust websocket-client
locust -f tests/load/locustfile.py --host=http://localhost:3001 --users 20 --spawn-rate 1
```

**监控指标**:

| 指标 | 阈值 |
|------|------|
| POST /analyze 成功率 | > 95% |
| p95 延迟（端到端） | < 30s |
| ws CPU 使用率 | < 50% |
| ai-gateway 内存 | 无明显增长 |

---

## 测试计划

| 阶段 | 内容 | 工具 |
|------|------|------|
| 阶段 1 | 单元测试（TS + Python） | vitest + pytest |
| 阶段 2 | 集成测试（3 场景） | python-socketio + requests |
| 阶段 3 | 负载测试（可选） | locust |

**单元测试和集成测试应纳入 CI（GitHub Actions 或 pre-commit hook）。**
