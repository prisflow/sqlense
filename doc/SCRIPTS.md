# 脚本与命令

## 开发

```bash
docker compose up -d                     # 启动全部服务
docker compose up -d --build             # 构建并启动
docker compose down                      # 停止，保留数据
docker compose down -v                   # 停止并清除数据
docker compose ps                        # 查看服务状态
docker compose logs -f <service>         # 查看日志
```

应用更新：

```bash
docker compose build <service>
docker compose up -d --no-deps <service>
```

## 构建 VS Code 扩展

```bash
bash scripts/build-extension.sh
```

输出到 `packages/vs-code-extension/node_modules/`。

## 批量置备学生

通过后台管理页面 → 学生管理 → CSV 导入，或直接调用 API：

```bash
curl -b /tmp/cookie -X POST http://localhost:4000/api/admin/students/import \
  -H "Content-Type: application/json" \
  -d '{"students":[{"student_no":"2024101","display_name":"张三","password":"pass101","class_id":"<班级UUID>"}]}'
```

导入自动创建 PG 数据库和角色（单容器模式不再创建 code-server 容器）。

## 管理员 API

```bash
# 登录
curl -c /tmp/cookie -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 带 cookie 请求
curl -b /tmp/cookie http://localhost:4000/api/admin/dashboard
```

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `admin` | admin |
