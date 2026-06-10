#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tests/scenarios"

# 删除所有学生 system 记录、数据库和角色
echo "[teardown] 清理 30 个测试学生..."

PGURL="postgresql://sqlense:sqlense@localhost:5432/sqlense"

for i in $(seq 1 30); do
  NUM=$(printf "%02d" $i)
  SNO="test_$NUM"
  DB="test_db_$NUM"
  ROLE="test_role_$NUM"

  psql "$PGURL" -c "DELETE FROM system.students WHERE student_no='$SNO';" 2>/dev/null || true
  psql "$PGURL" -c "DELETE FROM system.users WHERE username='$SNO';" 2>/dev/null || true
  psql "$PGURL" -c "DROP DATABASE IF EXISTS $DB;" 2>/dev/null || true
  psql "$PGURL" -c "DROP ROLE IF EXISTS $ROLE;" 2>/dev/null || true
  echo "  $SNO 已清理"
done

echo "[teardown] 完成"
