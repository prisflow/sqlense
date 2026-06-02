const vscode = require("vscode");

class RemoteControl {
  constructor(telemetry) {
    this.telemetry = telemetry;
    telemetry.on("takeover:start", () => this._onTakeover());
    telemetry.on("takeover:stop", () => this._onTakeoverEnd());
  }

  _onTakeover() {
    try { vscode.window.showWarningMessage("🔴 教师正在查看你的屏幕"); } catch (e) { /* ignore */ }
  }

  _onTakeoverEnd() {
    try { vscode.window.showInformationMessage("教师已停止查看你的屏幕"); } catch (e) { /* ignore */ }
  }

  dispose() {}
}

module.exports = { RemoteControl };
