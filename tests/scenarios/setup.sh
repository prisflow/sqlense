#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tests/scenarios"

echo "[setup] 使用主 PostgreSQL ($PGHOST:5432)"
PGHOST="${PGHOST:-localhost}"
PGURL="postgresql://sqlense:sqlense@${PGHOST}:5432"
SYSTEM_DB="${PGURL}/sqlense"

# ── 30 个学生: 10 correct + 8 missing_constraints + 7 not_started + 5 off_track ──
STUDENTS=(
  "test_db_01:test_role_01:stu01pass:correct"
  "test_db_02:test_role_02:stu02pass:correct"
  "test_db_03:test_role_03:stu03pass:correct"
  "test_db_04:test_role_04:stu04pass:correct"
  "test_db_05:test_role_05:stu05pass:correct"
  "test_db_06:test_role_06:stu06pass:correct"
  "test_db_07:test_role_07:stu07pass:correct"
  "test_db_08:test_role_08:stu08pass:correct"
  "test_db_09:test_role_09:stu09pass:correct"
  "test_db_10:test_role_10:stu10pass:correct"
  "test_db_11:test_role_11:stu11pass:missing_constraints"
  "test_db_12:test_role_12:stu12pass:missing_constraints"
  "test_db_13:test_role_13:stu13pass:missing_constraints"
  "test_db_14:test_role_14:stu14pass:missing_constraints"
  "test_db_15:test_role_15:stu15pass:missing_constraints"
  "test_db_16:test_role_16:stu16pass:missing_constraints"
  "test_db_17:test_role_17:stu17pass:missing_constraints"
  "test_db_18:test_role_18:stu18pass:missing_constraints"
  "test_db_19:test_role_19:stu19pass:not_started"
  "test_db_20:test_role_20:stu20pass:not_started"
  "test_db_21:test_role_21:stu21pass:not_started"
  "test_db_22:test_role_22:stu22pass:not_started"
  "test_db_23:test_role_23:stu23pass:not_started"
  "test_db_24:test_role_24:stu24pass:not_started"
  "test_db_25:test_role_25:stu25pass:not_started"
  "test_db_26:test_role_26:stu26pass:off_track"
  "test_db_27:test_role_27:stu27pass:off_track"
  "test_db_28:test_role_28:stu28pass:off_track"
  "test_db_29:test_role_29:stu29pass:off_track"
  "test_db_30:test_role_30:stu30pass:off_track"
)

for entry in "${STUDENTS[@]}"; do
  IFS=':' read -r db role pwd scenario <<<"$entry"
  echo "[setup] $db / $role"

  # 角色
  psql "$SYSTEM_DB" -tc "SELECT 1 FROM pg_roles WHERE rolname='$role'" | grep -q 1 || \
    psql "$SYSTEM_DB" -c "CREATE ROLE $role WITH LOGIN PASSWORD '$pwd';"

  # 数据库
  psql "$SYSTEM_DB" -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    psql "$SYSTEM_DB" -c "CREATE DATABASE $db OWNER $role;"

  psql "$SYSTEM_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $role;"

  # 注入场景数据
  DBURL="${PGURL}/${db}"
  psql "$DBURL" -c "CREATE SCHEMA IF NOT EXISTS lab AUTHORIZATION $role;"
  if [ -f "data/${scenario}.sql" ]; then
    psql "$DBURL" -f "data/${scenario}.sql"
  fi
  # 让 test_role 能看到 lab schema 中的表（便于 AI Gateway 预查数据库结构）
  psql "$DBURL" -c "GRANT SELECT ON ALL TABLES IN SCHEMA lab TO $role;"
  psql "$DBURL" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA lab GRANT SELECT ON TABLES TO $role;"
  echo "  → 完成"
done

# ── 注册到 system.students ──
echo "[setup] 注册学生到 system.students..."

for i in $(seq 1 30); do
  NUM=$(printf "%02d" $i)
  SNO="test_$NUM"
  DB="test_db_$NUM"
  ROLE="test_role_$NUM"
  PASS="stu${NUM}pass"

  psql "$SYSTEM_DB" -tc "SELECT 1 FROM system.users WHERE username='$SNO'" | grep -q 1 || \
    psql "$SYSTEM_DB" -c "
      INSERT INTO system.users (id, username, password_hash, role, display_name)
      VALUES (gen_random_uuid(), '$SNO', '\$2b\$10\$dGzXjZ.AhKgKK1HOaGPXZuceFJRP.s0vDON2KF4pFMG8PMOyZ77Cm', 'student', '测试$NUM');
    "

  U_UUID=$(psql "$SYSTEM_DB" -tA -c "SELECT id FROM system.users WHERE username='$SNO'")
  CID="00000000-0000-0000-0000-000000000001"

  psql "$SYSTEM_DB" -tc "SELECT 1 FROM system.students WHERE student_no='$SNO'" | grep -q 1 || \
    psql "$SYSTEM_DB" -c "
      INSERT INTO system.students (user_id, class_id, student_no, pg_db_name, pg_role_name, cs_port, cs_password, status)
      VALUES ('$U_UUID', '$CID', '$SNO', '$DB', '$ROLE', $((10000 + i)), '$PASS', 'active');
    "
  echo "  → $SNO 已注册"
done

echo "[setup] 完成"
