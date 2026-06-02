FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc

FROM node:22-alpine
RUN apk add --no-cache docker-cli docker-compose
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist/ .
EXPOSE 4000
CMD ["node", "index.js"]
