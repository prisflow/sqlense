# SQLense — AGENTS.md

## User expectations
- **All code is reviewed.** Every line of code, comment, and config will be reviewed. Write clean, well-commented code.
- **Add function-level comments** to every method/function explaining what it does and why.
- **Light/clean design.** No dark "AI" themes, no bright purple/indigo accents, no icons in page content (lucide is internal to shadcn components only).
- **Python environment uses micromamba.** Located at `/home/tobegold574/.local/bin/micromamba`. Never use venv or pip directly.

## Quick commands

```bash
# full startup
docker compose build && docker compose up -d

# fast rebuild — only restart changed service
docker compose build web && docker compose up -d --no-deps web

# clean restart (removes all data)
docker compose down -v && docker compose up -d --build

# check status
docker compose ps

# logs
docker compose logs -f web
```

## Architecture (7 containers)

| Container | Port | Role |
|-----------|------|------|
| postgres | 5432 | System DB (`sqlense`) + student DBs (`db_student_*`) |
| api-server | 4000 | Express REST API, httpOnly Cookie JWT auth |
| websocket | 3001 | Socket.IO real-time events |
| ai-gateway | 8000 | Python FastAPI, telemetry analysis |
| auth-proxy | 8080 | Nginx auth_request gate for code-server |
| web | 3000 | Nginx + React SPA |
| student-1 | 8443 | code-server (--auth none, behind auth-proxy) |

## Auth
- **httpOnly Cookie**, not Bearer token. Login at `POST /api/auth/login` sets `Set-Cookie: token=<JWT>`.
- All API routes read JWT from `req.cookies.token`.
- Roles: `admin`→`/admin/*` `teacher`→`/teacher/*` `student`→`/student/*`

## Routes (React SPA)
- `/login` — LoginPage
- `/teacher/*` — Teacher dashboard (student grid, AI panel, iframe takeover)
- `/student/*` — Student dashboard (tasks, IDE iframe)
- `/admin/*` — Admin panel (sidebar: overview, classes, teachers, students, logs)

## Frontend (Tailwind v4 + shadcn v4)
- **DO NOT add custom className overrides to shadcn components.** Use them exactly as the official API:
  - `<Select items={items}>` + `<SelectGroup>` + `<SelectLabel>` + `<SelectValue />` — no `placeholder` prop
  - `<Dialog open={open} onOpenChange={setOpen}>` + `<DialogContent>` + `<DialogTitle>`
  - `<Badge variant="outline|destructive|default|secondary">` — no non-existent variants like "success" or "danger"
- CSS variables in `@theme inline` block, not `@layer base :root`.
- `shadcn/tailwind.css` and `tw-animate-css` are Tailwind v4 imports — keep compatible.

## Default accounts
| Username | Password | Role |
|----------|----------|------|
| admin | admin | admin |

## Database
- System tables: `system.users`, `system.classes`, `system.students`, `system.task_files`, `system.settings`, `system.audit_logs`
- Each student has separate PG database (`db_student_*`) and role (`role_student_*`) — created by provision script
- `seed.sql` in `packages/api-server/sql/` has preset data with real bcrypt hashes

## Provisioning
Import via admin API (`POST /api/admin/students/import`) or admin UI CSV dialog.
Creates PG databases, roles, and code-server containers automatically.

## Key gotchas
- Student passwords are bcrypt hashes in DB, matched via `bcrypt.compare()` in API. Seed must use real hashes.
- code-server runs `--auth none`. Auth proxy (8080) does `auth_request /api/auth/verify` before proxying to students.
- Rebuilding all containers every time is unnecessary and annoying. Use `--no-deps` flag.
- Don't add extra Tailwind classes to shadcn components — they'll break internal layouts.
- **Use every dependency exactly as documented.** Read the official API before using a package. Don't guess usage patterns or add custom workarounds — if your approach requires overriding internal styles or passing undocumented props, you're using it wrong.
