# WebSocket 事件

基于 Socket.IO，端口 3001。教师和学生通过 `query.role` 区分身份。

## 身份

```
教师:   io(url, { query: { role: "teacher" } })
学生:   io(url, { query: { role: "student", studentId, studentName } })
```

## 事件总览

```mermaid
graph LR
    subgraph 学生
        TE[student:telemetry]
    end

    subgraph 服务器
        SO[teacher:student-online]
        SFO[teacher:student-offline]
        ST[teacher:telemetry]
        SU[teacher:status-update]
        AA[teacher:ai-analysis]
        TKO[takeover:start]
        TKC[takeover:stop]
    end

    subgraph 教师
        TA[teacher:takeover]
        TR[teacher:takeover-release]
        AQ[teacher:ai-query]
        LS[teacher:list-students]
    end

    TE --> SO & SFO & ST
    TA --> TKO
    TR --> TKC
    AQ --> AA

    TE -.->|转发| ST
    TE -.->|分析| AA
```

## 学生 → 服务器

| 事件 | 触发 | 数据 |
|------|------|------|
| `student:telemetry` | 编辑器变更 / 空闲 | `{ type, timestamp, payload }` |

## 服务器 → 教师

| 事件 | 触发 | 数据 |
|------|------|------|
| `teacher:student-online` | 学生 WebSocket 连接 | `{ studentId, studentName }` |
| `teacher:student-offline` | 学生断线后 5 秒 | `{ studentId }` |
| `teacher:telemetry` | 转发学生遥测 | `{ studentId, data: { type, timestamp, payload } }` |
| `teacher:status-update` | 接管状态变化 | `{ studentId, takeoverActive: boolean }` |
| `teacher:ai-analysis` | AI 分析完成 | `{ studentId, analysis: { priority, progress, issues } }` |
| `teacher:error` | 操作失败 | `{ message }` |

## 教师 → 服务器

| 事件 | 说明 |
|------|------|
| `teacher:takeover` | 请求接管学生 `{ studentId }` |
| `teacher:takeover-release` | 释放接管 `{ studentId }` |
| `teacher:ai-query` | 请求 AI 分析 `{ studentId }` |
| `teacher:list-students` | 获取当前在线学生列表 |

## 服务器 → 学生

| 事件 | 说明 |
|------|------|
| `takeover:start` | 教师开始查看 |
| `takeover:stop` | 教师停止查看 |

## 教师接管时序

```mermaid
sequenceDiagram
    participant T as 教师
    participant WS as WebSocket Server
    participant S as 学生扩展

    T->>WS: teacher:takeover(studentId)
    WS-->>T: teacher:takeover-started
    WS->>WS: session.takeoverActive = true
    WS->>S: takeover:start
    S->>S: showWarningMessage
    WS->>T: teacher:status-update(takeoverActive=true)

    Note over T,S: 画面查看走 iframe localhost:<port>

    T->>WS: teacher:takeover-release(studentId)
    WS->>WS: session.takeoverActive = false
    WS->>S: takeover:stop
    S->>S: showInformationMessage
    WS->>T: teacher:status-update(takeoverActive=false)
```

## 断线缓冲

学生 WebSocket 断开后，服务器不立即标记离线，等待 5 秒：

```
学生断线 → 5 秒计时 → 未重连 → 标记 offline
                      ↓
                 重连成功 → 取消计时
```

## 离线保护

```mermaid
sequenceDiagram
    participant S as 学生
    participant WS as WebSocket
    participant T as 教师

    S--xWS: 断开 (brief)
    WS->>WS: 5s timer start
    S->>WS: 重连 (within 5s)
    WS->>WS: cancel timer
    WS->>T: 不发送 offline 事件

    Note over S,WS: 5 秒内重连，教师端无感知
```
