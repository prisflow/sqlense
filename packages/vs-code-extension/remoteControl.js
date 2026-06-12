const vscode = require("vscode");

class RemoteControl {
  // 构造接管提醒控制器
  constructor(telemetry) {
    this.telemetry = telemetry;
    telemetry.on("takeover:start", () => this._onTakeover());
    telemetry.on("takeover:stop", () => this._onTakeoverEnd());
  }

  // 显示教师正在查看屏幕的警告
  _onTakeover() {
    try { vscode.window.showWarningMessage("🔴 教师正在查看你的屏幕"); } catch { /* ignore */ }
  }

  // 显示教师已停止查看屏幕的通知
  _onTakeoverEnd() {
    try { vscode.window.showInformationMessage("教师已停止查看你的屏幕"); } catch { /* ignore */ }
  }

  // 释放资源
  dispose() {}
}

module.exports = { RemoteControl };
