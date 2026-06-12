const vscode = require("vscode");

class Tracker {
  // 初始化遥测采集器，注册各监控模块
  constructor(telemetry) {
    this.telemetry = telemetry;
    this.idleTimer = null;
    this.lastActivity = Date.now();
    this.disposables = [];
    this.diagCounts = new Map();
    this.diagTimers = new Map();
    this.codeHistory = [];
    this.lastCodeSnapshot = "";
    this._idleReported = false;
    this._init();
  }

  // 注册编辑器变更/选择/活动等事件监听
  _init() {
    this.disposables.push(
      // SQL 文档变更时触发活动标记
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== "sql") return;
        this._onActivity();
      })
    );

    this.disposables.push(
      // 选区变更时触发活动标记
      vscode.window.onDidChangeTextEditorSelection(() => {
        this._onActivity();
      })
    );

    this.disposables.push(
      // 活动编辑器变更时触发活动标记
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._onActivity();
      })
    );

    this._startIdleMonitor();
    this._startCodeHistoryMonitor();
    this._startSqlToolsMonitor();
    this._startDiagnosticsMonitor();
  }

  // 获取当前 SQL 编辑器的文本内容
  _getEditorSql() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") return "";
    return editor.document.getText();
  }

  // 每 30 秒快照代码历史
  _startCodeHistoryMonitor() {
    setInterval(() => {
      const text = this._getEditorSql();
      if (!text || text === this.lastCodeSnapshot) return;
      this.lastCodeSnapshot = text;
      this.codeHistory.push({ text, timestamp: Date.now() });
      if (this.codeHistory.length > 5) this.codeHistory.shift();
    }, 30000);
  }

  // 挂钩 SQLTools 扩展的查询命令
  async _startSqlToolsMonitor() {
    try {
      const ext = vscode.extensions.getExtension("mtxr.sqltools");
      if (!ext) return;
      if (!ext.isActive) await ext.activate();
      const api = ext.exports;
      if (!api || !api.addBeforeCommandHook) return;

      const COMMANDS = ["executeQuery", "executeCurrentQuery", "executeQueryFromFile", "executeFromInput"];

      for (const cmd of COMMANDS) {
        // SQLTools 执行前采样 SQL 推入 codeHistory，供后续诊断错误时一并上报
        api.addBeforeCommandHook(cmd, (evt) => {
          this._onActivity();
          let sql = "";
          if (cmd === "executeQuery" && typeof evt.args[0] === "string") {
            sql = evt.args[0];
          } else {
            sql = this._getEditorSql();
          }
          if (!sql) return;
          this.codeHistory.push({ text: sql, timestamp: Date.now() });
          if (this.codeHistory.length > 5) this.codeHistory.shift();
        });

        // SQLTools 执行后检查结果中是否包含 PG 错误，有则上报
        if (api.addAfterCommandSuccessHook) {
          api.addAfterCommandSuccessHook(cmd, (evt) => {
            const text = JSON.stringify(evt.result || "");
            if (/ERROR|syntax error|relation.*not exist|does not exist|column.*not exist/i.test(text)) {
              this.telemetry.send({
                type: "error",
                timestamp: Date.now(),
                payload: {
                  source: "sqltools",
                  code: this._getEditorSql(),
                  codeHistory: this.codeHistory,
                  message: text.slice(0, 500),
                },
              });
            }
          });
        }
      }
    } catch (e) {
      console.error("SQLense: failed to hook SQLTools", e);
    }
  }

  // 监听诊断变更，检测持续错误
  _startDiagnosticsMonitor() {
    vscode.languages.onDidChangeDiagnostics((e) => {
      for (const uri of e.uris) {
        if (!uri.path.endsWith(".sql")) continue;
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length === 0) {
          this.diagCounts.delete(uri.toString());
          this.diagTimers.delete(uri.toString());
          return;
        }

        const key = uri.toString();
        const count = (this.diagCounts.get(key) || 0) + 1;
        this.diagCounts.set(key, count);

        if (this.diagTimers.has(key)) return;

        this.diagTimers.set(key, setTimeout(() => {
          this.diagTimers.delete(key);
          const finalCount = this.diagCounts.get(key) || 0;
          this.diagCounts.delete(key);
          if (finalCount < 2) return;

          const latest = vscode.languages.getDiagnostics(uri);
          const latestErrors = latest.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
          if (latestErrors.length === 0) return;

          this.telemetry.send({
            type: "error",
            timestamp: Date.now(),
            payload: {
              source: "diagnostics",
              code: this._getEditorSql(),
              codeHistory: this.codeHistory,
              errors: latestErrors.map((d) => ({
                line: d.range.start.line + 1,
                message: d.message,
              })),
            },
          });
        }, 5000));
      }
    });
  }

  // 更新最后活动时间，重置空闲定时器和空闲标记
  _onActivity() {
    this.lastActivity = Date.now();
    this._idleReported = false;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // 每分钟检查空闲超时并上报（每个空闲周期只发一次）
  _startIdleMonitor() {
    setInterval(() => {
      const idleTime = (Date.now() - this.lastActivity) / 1000;
      if (idleTime > 180 && !this._idleReported) {
        this._idleReported = true;
        this.telemetry.send({
          type: "idle",
          timestamp: Date.now(),
          payload: { duration: idleTime },
        });
      }
    }, 60000);
  }

  // 释放所有资源，清理定时器
  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const timer of this.diagTimers.values()) clearTimeout(timer);
    this.diagTimers.clear();
  }
}

module.exports = { Tracker };
