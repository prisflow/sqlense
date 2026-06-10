const vscode = require("vscode");
const { Tracker } = require("./tracker");
const { TelemetryClient } = require("./telemetry");
const { RemoteControl } = require("./remoteControl");
const { registerDiagnosticProvider } = require("./sqlDiagnostics");

// 扩展激活入口，初始化所有组件
function activate(context) {
  const config = vscode.workspace.getConfiguration("sqlense");
  const wsServer =
    config.get("wsServer") ||
    process.env.SQLENSE_WS_SERVER ||
    "ws://localhost:3001";
  const studentId =
    config.get("studentId") ||
    process.env.STUDENT_ID ||
    "unknown";
  const studentName =
    config.get("studentName") ||
    process.env.STUDENT_NAME ||
    "Unknown";

  const telemetry = new TelemetryClient(wsServer, studentId, studentName);
  const tracker = new Tracker(telemetry);
  const remoteControl = new RemoteControl(telemetry);

  registerDiagnosticProvider(context);

  context.subscriptions.push(
    // 处理连接命令，连接课堂服务器
    vscode.commands.registerCommand("sqlense.connect", () => {
      telemetry.connect();
      vscode.window.showInformationMessage("SQLense: 已连接到课堂");
    }),

    // 显示 SQLense 连接状态
    vscode.commands.registerCommand("sqlense.status", () => {
      const status = telemetry.isConnected() ? "已连接" : "未连接";
      vscode.window.showInformationMessage(`SQLense 状态: ${status}`);
    })
  );

  context.subscriptions.push(tracker);
  context.subscriptions.push(remoteControl);
  context.subscriptions.push(telemetry);

  telemetry.connect();

  vscode.window.showInformationMessage(
    `SQLense: 已激活 - ${studentName}`
  );
}

// 扩展停用时的清理操作
function deactivate() {}

module.exports = { activate, deactivate };
