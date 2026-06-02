#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/packages/vs-code-extension"
DOCKER_EXT_DIR="$ROOT/docker/student/extensions"

echo "🔧 构建 SQLense VS Code Extension..."

mkdir -p "$DOCKER_EXT_DIR"
rm -rf "$DOCKER_EXT_DIR"/*

# Copy extension source and package.json
cd "$EXT_DIR"
cp package.json "$DOCKER_EXT_DIR/"
cp src/*.js "$DOCKER_EXT_DIR/"

# Install dependencies
cd "$DOCKER_EXT_DIR"
npm install --omit=dev --production 2>&1 | tail -3

echo "✅ 扩展文件已就绪: $DOCKER_EXT_DIR ($(ls -la node_modules/ 2>/dev/null | wc -l) 个依赖包)"
