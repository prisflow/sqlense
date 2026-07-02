#!/bin/sh
# 从 /etc/hosts 提取 host.docker.internal 的真实 IP（由 extra_hosts 注入）
# 供 nginx 模板内 ${HOST_GW} 使用，避免硬编码网关 IP
HOST_GW=$(grep host.docker.internal /etc/hosts | awk '{print $1}')
export HOST_GW

# 交给官方 nginx entrypoint（它负责 envsubst 模板 + 启动 nginx）
exec /docker-entrypoint.sh "$@"
