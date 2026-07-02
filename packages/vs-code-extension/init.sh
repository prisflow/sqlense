#!/bin/bash
echo "[init] 开始初始化学生容器..."

mkdir -p /config/.config/code-server

echo "[init] 生成 VS Code 配置..."
CS_PORT="${CS_PORT:-8443}"
cat > /config/.config/code-server/config.yaml <<YAML
bind-addr: 0.0.0.0:${CS_PORT}
auth: none
cert: false
YAML

# Clean old extensions
rm -rf /config/extensions/ckolkman.vscode-postgres

# Install SQLense extension
echo "[init] 安装 SQLense 扩展..."
VSCODE_EXT_DIR="/config/extensions"
EXT_DIR="$VSCODE_EXT_DIR/sqlense.sqlense-vscode"
rm -rf "$EXT_DIR" "$VSCODE_EXT_DIR/extensions.json" "$VSCODE_EXT_DIR/.obsolete"
mkdir -p "$EXT_DIR"
cp -r /opt/extensions/sqlense-vscode/* "$EXT_DIR/"
cd "$EXT_DIR" && npm install --omit=dev
chown -R abc:abc "$EXT_DIR" 2>/dev/null || true

# Install SQLTools extensions
echo "[init] 安装 SQLTools 扩展..."
for EXT in mtxr.sqltools mtxr.sqltools-driver-pg; do
  SRC="/opt/extensions/$EXT"
  if [ -d "$SRC" ]; then
    DST="$VSCODE_EXT_DIR/$EXT"
    rm -rf "$DST"
    cp -r "$SRC" "$DST"
    chown -R abc:abc "$DST" 2>/dev/null || true
    echo "[init] SQLTools 扩展已安装: $EXT"
  fi
done

mkdir -p /config/workspace/sql-lab

echo "[init] 配置环境变量..."
if [ -n "$WS_SERVER" ]; then
  {
    echo "export SQLENSE_WS_SERVER=$WS_SERVER"
    echo "export STUDENT_ID=${STUDENT_NO:-${STUDENT_ID:-unknown}}"
    echo "export STUDENT_NAME=${STUDENT_NAME:-unknown}"
    echo "export PG_HOST=${PG_HOST:-postgres}"
    echo "export PG_USER=${PG_USER:-sqlense}"
    echo "export PG_PASSWORD=${PG_PASSWORD:-sqlense}"
    echo "export PG_DATABASE=${PG_DATABASE:-sqldb}"
    echo "export PGPASSWORD=${PG_PASSWORD:-sqlense}"
  } >> /config/.bashrc
fi

echo "[init] 生成 VS Code settings.json..."
mkdir -p /config/data/User
cat > /config/data/User/settings.json <<EOF
{
  "sqlense.wsServer": "${WS_SERVER:-ws://websocket:3001}",
  "sqlense.studentId": "${STUDENT_NO:-${STUDENT_ID:-unknown}}",
  "sqlense.studentName": "${STUDENT_NAME:-unknown}",
  "workbench.auth.enabled": false,
  "chat.feature.enabled": false,
  "inlineChat.mode": "off",
  "github.copilot.enable": false,
  "extensions.experimental.enabled": false,
  "workbench.enableExperiments": false,
  "security.workspace.trust.enabled": false,
  "sqltools.connections": [
    {
      "name": "实验数据库",
      "driver": "PostgreSQL",
      "server": "${PG_HOST:-postgres}",
      "port": 5432,
      "database": "${PG_DATABASE}",
      "username": "${PG_USER}",
      "password": "${PG_PASSWORD}"
    }
  ]
}
EOF

chown -R abc:abc /config/workspace 2>/dev/null || true
chown -R abc:abc /config/extensions 2>/dev/null || true

echo "[init] 初始化完成，启动 code-server..."
exec /init
