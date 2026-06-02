# DEPLOYMENT

## 前提

| 项目 | 要求 |
|------|------|
| Docker | 29+ & Compose v5+ |
| 服务器 | 2C4G + 20GB |
| 域名 | 可选（HTTPS） |

## 部署

```bash
git clone <repo> && cd sqlense
bash scripts/build-extension.sh
docker compose up -d --build
docker compose ps
```

确保 7 个服务全部 `Up`。

## 批量置备学生

在后台管理页面 → 学生管理 → CSV 导入，或调用 API。

## 运维

| 命令 | 用途 |
|------|------|
| `docker compose ps` | 服务状态 |
| `docker compose logs -f api-server` | API 日志 |
| `docker compose exec postgres psql -U sqlense -d sqlense` | 查系统库 |
| `docker compose down -v` | 完全清理 |
| 后台 → 学生管理 → CSV 导入 | 批量置备学生 |
