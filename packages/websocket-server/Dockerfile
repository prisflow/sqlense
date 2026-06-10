# ── Build Stage ──
# 编译 TypeScript → JavaScript
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json .
COPY src/ ./src/
RUN npx tsc

# ── Production Stage ──
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist/ .

EXPOSE 3001

CMD ["node", "index.js"]
