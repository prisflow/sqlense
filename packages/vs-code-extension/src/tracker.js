const vscode = require("vscode");

class Tracker {
  constructor(telemetry) {
    this.telemetry = telemetry;
    this.idleTimer = null;
    this.lastActivity = Date.now();
    this.disposables = [];

    this._init();
  }

  _init() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== "sql") return;
        this._onActivity();
        this.telemetry.send({
          type: "editor",
          timestamp: Date.now(),
          payload: {
            fileName: e.document.fileName,
            changeCount: e.contentChanges.length,
            lineCount: e.document.lineCount,
          },
        });
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this._onActivity();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (!e) return;
        this._onActivity();
        this.telemetry.send({
          type: "editor",
          timestamp: Date.now(),
          payload: {
            event: "focus",
            fileName: e.document.fileName,
            languageId: e.document.languageId,
          },
        });
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("type", () => {
        this._onActivity();
      })
    );

    this._startIdleMonitor();
  }

  _onActivity() {
    this.lastActivity = Date.now();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  _startIdleMonitor() {
    setInterval(() => {
      const idleTime = (Date.now() - this.lastActivity) / 1000;
      if (idleTime > 30) {
        this.telemetry.send({
          type: "idle",
          timestamp: Date.now(),
          payload: { duration: idleTime },
        });
      }
    }, 30000);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

module.exports = { Tracker };
