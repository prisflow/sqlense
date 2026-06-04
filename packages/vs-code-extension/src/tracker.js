const vscode = require("vscode");

class Tracker {
  constructor(telemetry) {
    this.telemetry = telemetry;
    this.idleTimer = null;
    this.lastActivity = Date.now();
    this.disposables = [];
    this.diagTimer = null;
    this.diagCount = 0;
    this.codeHistory = [];
    this.lastCodeSnapshot = "";
  }

  _init() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== "sql") return;
        this._onActivity();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this._onActivity();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._onActivity();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("type", () => {
        this._onActivity();
      })
    );

    this._startIdleMonitor();
    this._startCodeHistoryMonitor();
    this._startTerminalMonitor();
    this._startDiagnosticsMonitor();
  }

  _getEditorSql() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "sql") return "";
    return editor.document.getText();
  }

  _startCodeHistoryMonitor() {
    setInterval(() => {
      const text = this._getEditorSql();
      if (!text || text === this.lastCodeSnapshot) return;
      this.lastCodeSnapshot = text;
      this.codeHistory.push({ text, timestamp: Date.now() });
      if (this.codeHistory.length > 5) this.codeHistory.shift();
    }, 30000);
  }

  _startTerminalMonitor() {
    if (vscode.window.terminals) {
      vscode.window.terminals.forEach((t) => this._listenTerminal(t));
    }
    vscode.window.onDidOpenTerminal((t) => this._listenTerminal(t));
  }

  _listenTerminal(terminal) {
    const writer = terminal.onDidWriteData((data) => {
      this._onActivity();
      const cleaned = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
      if (!cleaned) return;

      if (cleaned.includes("ERROR") || cleaned.includes("syntax error") || cleaned.startsWith("psql:")) {
        this.telemetry.send({
          type: "error",
          timestamp: Date.now(),
          payload: {
            message: cleaned,
            code: this._getEditorSql(),
            codeHistory: this.codeHistory,
          },
        });
      }

      if (/^(CREATE|INSERT|SELECT|ALTER|DROP|UPDATE|DELETE)\s/i.test(cleaned)) {
        this.telemetry.send({
          type: "terminal",
          timestamp: Date.now(),
          payload: { output: cleaned },
        });
      }

      if (/[=][#>]/.test(cleaned)) {
        this.telemetry.send({
          type: "terminal",
          timestamp: Date.now(),
          payload: { output: cleaned },
        });
      }
    });

    const closer = terminal.onDidCloseTerminal(() => {
      writer.dispose();
      closer.dispose();
    });

    this.disposables.push(writer, closer);
  }

  _startDiagnosticsMonitor() {
    vscode.languages.onDidChangeDiagnostics((e) => {
      for (const uri of e.uris) {
        if (!uri.path.endsWith(".sql")) continue;
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length === 0) { this.diagCount = 0; return; }

        this.diagCount++;
        if (this.diagTimer) return;

        this.diagTimer = setTimeout(() => {
          this.diagTimer = null;
          if (this.diagCount < 2) { this.diagCount = 0; return; }

          this.telemetry.send({
            type: "error",
            timestamp: Date.now(),
            payload: {
              source: "diagnostics",
              code: this._getEditorSql(),
              codeHistory: this.codeHistory,
              errors: errors.map((d) => ({
                line: d.range.start.line + 1,
                message: d.message,
              })),
            },
          });
          this.diagCount = 0;
        }, 5000);
      }
    });
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
      if (idleTime > 180) {
        this.telemetry.send({
          type: "idle",
          timestamp: Date.now(),
          payload: { duration: idleTime },
        });
      }
    }, 60000);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    if (this.diagTimer) clearTimeout(this.diagTimer);
  }
}

module.exports = { Tracker };
