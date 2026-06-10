#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/packages/vs-code-extension"

echo "🔧 构建 SQLense VS Code Extension..."

cd "$EXT_DIR"
npm install --omit=dev --production 2>&1 | tail -3

echo "✅ 依赖安装完成: $EXT_DIR"
