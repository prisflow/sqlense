const vscode = require("vscode");
const { parse } = require("pgsql-ast-parser");

// 从错误消息解析行列位置
function _getPosition(text, err) {
  const m = err.message && err.message.match(/line\s+(\d+)\s+col\s+(\d+)/i);
  if (m) {
    const line = Math.max(0, parseInt(m[1]) - 1);
    const col = Math.max(0, parseInt(m[2]) - 1);
    const lines = text.split("\n");
    const lineText = lines[line] || "";
    return new vscode.Range(
      new vscode.Position(line, col),
      new vscode.Position(line, Math.max(col, lineText.length))
    );
  }
  return new vscode.Range(0, 0, 0, 0);
}

// 解析 SQL 文档，返回诊断错误
function _validateSQL(document) {
  const text = document.getText();
  if (!text.trim()) return [];

  try {
    parse(text);
    return [];
  } catch (err) {
    const msg = err.message || "SQL 语法错误";
    const range = (err.location && err.location.start)
      ? new vscode.Range(
          Math.max(0, err.location.start.line - 1),
          Math.max(0, err.location.start.column - 1),
          Math.max(0, err.location.end.line - 1),
          Math.max(0, err.location.end.column - 1)
        )
      : _getPosition(text, err);
    return [new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error)];
  }
}

// 注册 SQL 诊断提供者
function registerDiagnosticProvider(context) {
  const collection = vscode.languages.createDiagnosticCollection("sqlense");
  let timer = null;

  // 防抖调度文档校验
  function schedule(doc) {
    if (doc.languageId !== "sql") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (doc.isClosed) return;
      collection.set(doc.uri, _validateSQL(doc));
    }, 400);
  }

  context.subscriptions.push(
    // 文档变更时触发校验
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    // 文档打开时触发校验
    vscode.workspace.onDidOpenTextDocument((doc) => schedule(doc)),
    // 文档关闭时清除诊断
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    collection
  );

  // 对已打开文档初始化校验
  vscode.workspace.textDocuments.forEach((doc) => schedule(doc));
}

module.exports = { registerDiagnosticProvider };
