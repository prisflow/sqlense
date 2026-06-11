# ── Build Stage ──
# 编译 TypeScript → JavaScript
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci
COPY . .
RUN npx tsc

# ── Production Stage ──
FROM node:22-alpine
# docker-cli 和 docker-compose 供 admin 路由中 execSync 调用 docker 管理学生容器
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache docker-cli docker-compose
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --only=production
COPY --from=builder /app/dist/ .
EXPOSE 4000
CMD ["node", "index.js"]
