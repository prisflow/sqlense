const vscode = require("vscode");
const { parse } = require("pgsql-ast-parser");

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

function registerDiagnosticProvider(context) {
  const collection = vscode.languages.createDiagnosticCollection("sqlense");
  let timer = null;

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
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidOpenTextDocument((doc) => schedule(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    collection
  );

  vscode.workspace.textDocuments.forEach((doc) => schedule(doc));
}

module.exports = { registerDiagnosticProvider };
