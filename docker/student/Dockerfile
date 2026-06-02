FROM linuxserver/code-server:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY extensions /opt/extensions/sqlense-vscode
COPY task /task
COPY init.sh /init.sh
RUN chmod +x /init.sh

RUN rm -rf /app/code-server/lib/vscode/extensions/github* \
           /app/code-server/lib/vscode/extensions/git* \
           /app/code-server/lib/vscode/extensions/mermaid-chat-features \
           /app/code-server/lib/vscode/extensions/microsoft* 2>/dev/null || true

RUN /app/code-server/bin/code-server --install-extension mtxr.sqltools --force 2>/dev/null || true; \
    SQLTOOLS=$(find /config -path "*/extensions/mtxr.sqltools*" -maxdepth 5 -type d 2>/dev/null | head -1); \
    if [ -n "$SQLTOOLS" ]; then cp -r "$SQLTOOLS" /opt/extensions/mtxr.sqltools; fi
RUN /app/code-server/bin/code-server --install-extension mtxr.sqltools-driver-pg --force 2>/dev/null || true; \
    PGDRV=$(find /config -path "*/extensions/mtxr.sqltools-driver*" -maxdepth 5 -type d 2>/dev/null | head -1); \
    if [ -n "$PGDRV" ]; then cp -r "$PGDRV" /opt/extensions/mtxr.sqltools-driver-pg; fi
RUN mkdir -p /config/workspace/sql-lab
COPY workspace/welcome.sql /config/workspace/sql-lab/
COPY workspace/task.md /config/workspace/sql-lab/

ENV DEFAULT_WORKSPACE=/config/workspace/sql-lab
ENV PG_HOST=postgres
ENV PG_USER=sqlense
ENV PG_PASSWORD=sqlense
ENV PG_DATABASE=sqldb

ENTRYPOINT ["/init.sh"]
