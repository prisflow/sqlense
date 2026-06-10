# 学生 code-server 容器：预装 SQLense 插件 + SQLTools + psql 客户端
# 初始化由 init.sh 完成（安装扩展、配置数据库连接、禁用无关功能）
FROM linuxserver/code-server:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制 SQLense 扩展源码（init.sh 中会 npm install 安装依赖）
COPY extension.js telemetry.js tracker.js remoteControl.js sqlDiagnostics.js package.json package-lock.json /opt/extensions/sqlense-vscode/
COPY init.sh /init.sh
RUN chmod +x /init.sh

# 移除 github/git/Microsoft 等无关内置扩展，减少资源占用
RUN rm -rf /app/code-server/lib/vscode/extensions/github* \
           /app/code-server/lib/vscode/extensions/git* \
           /app/code-server/lib/vscode/extensions/mermaid-chat-features \
           /app/code-server/lib/vscode/extensions/microsoft* 2>/dev/null || true

# 预安装 SQLTools 并拷贝到 /opt/extensions 供 init.sh 使用
RUN /app/code-server/bin/code-server --install-extension mtxr.sqltools --force 2>/dev/null || true; \
    SQLTOOLS=$(find /config -path "*/extensions/mtxr.sqltools*" -maxdepth 5 -type d 2>/dev/null | head -1); \
    if [ -n "$SQLTOOLS" ]; then cp -r "$SQLTOOLS" /opt/extensions/mtxr.sqltools; fi
RUN /app/code-server/bin/code-server --install-extension mtxr.sqltools-driver-pg --force 2>/dev/null || true; \
    PGDRV=$(find /config -path "*/extensions/mtxr.sqltools-driver*" -maxdepth 5 -type d 2>/dev/null | head -1); \
    if [ -n "$PGDRV" ]; then cp -r "$PGDRV" /opt/extensions/mtxr.sqltools-driver-pg; fi

ENV PG_HOST=postgres
ENV PG_USER=sqlense
ENV PG_PASSWORD=sqlense
ENV PG_DATABASE=sqldb

ENTRYPOINT ["/init.sh"]
