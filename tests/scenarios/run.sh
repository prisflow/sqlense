#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tests/scenarios"

echo ""
echo "========================================"
echo " SQLense 场景测试套件"
echo "========================================"

echo ""
# Phase 1: 创建30个测试数据库和角色
echo "[phase 1] 初始化 30 个测试数据库..."
bash setup.sh

echo ""
# Phase 2: 生成30个学生的遥测数据
echo "[phase 2] 生成 student JSON..."
python3 students/generate.py

echo ""
echo "────────────────────────────────────────"
echo " Layer 1: 全局 Batch 触发"
echo "────────────────────────────────────────"
# Phase 3: 发送100条全局事件触发batch分析
python3 layers/layer1_global.py 2>&1 | tee /tmp/layer1_out.txt
LAYER1_A=$(python3 -c "import json; r=json.load(open('layers/layer1_report.json')); print(r.get('analyses',0))")
echo "  Layer 1 分析数: $LAYER1_A"

echo ""
echo "────────────────────────────────────────"
echo " Layer 2: 单生高频触发"
echo "────────────────────────────────────────"
# Phase 4: 单学生高频发送触发flushStudent分析
echo " 等待 Layer 1 残留请求消散 (30s)..."
sleep 30
docker compose -f "$ROOT/docker-compose.yml" restart websocket
sleep 5
python3 layers/layer2_highfreq.py 2>&1 | tee /tmp/layer2_out.txt
LAYER2_A=$(python3 -c "import json; r=json.load(open('layers/layer2_report.json')); print(r.get('analyses',0))")
echo "  Layer 2 分析数: $LAYER2_A"

echo ""
echo "────────────────────────────────────────"
echo " Layer 3: 全量学生直接验证"
echo "────────────────────────────────────────"
# Phase 5: 直接POST分析所有学生的遥测数据
python3 layers/layer3_direct.py 2>&1 | tee /tmp/layer3_out.txt
LAYER3_P=$(python3 -c "import json; r=json.load(open('layers/layer3_report.json')); print(r.get('passed',0))")
LAYER3_T=$(python3 -c "import json; r=json.load(open('layers/layer3_report.json')); print(r.get('analyses',0))")
echo "  Layer 3: $LAYER3_P/$LAYER3_T 通过"

echo ""
echo "========================================"
echo " 测试报告"
echo "========================================"

# Phase 6: 汇总三层报告并输出结论
python3 -c "
import json
r1 = json.load(open('layers/layer1_report.json'))
r2 = json.load(open('layers/layer2_report.json'))
r3 = json.load(open('layers/layer3_report.json'))
print(f'Layer 1 (全局 Batch): 分析={r1[\"analyses\"]}  错误={r1[\"errors\"]}')
print(f'Layer 2 (单生高频):   分析={r2[\"analyses\"]}  错误={r2[\"errors\"]}')
print(f'Layer 3 (全量直接):   {r3[\"passed\"]}/{r3[\"analyses\"]} 通过  错误={r3[\"errors\"]}')
t = r1['analyses']+r2['analyses']+r3['analyses']
e = r1['errors']+r2['errors']+r3['errors']
print(f'总计: 分析={t}  错误={e}')
for d in r1.get('details',[]) + r2.get('details',[]):
    print(f'  {d[\"student_id\"]}: priority={d[\"priority\"]} 诊断={d[\"diagnosis\"][:60]}...')
if e == 0 and t > 0:
    print('结论: ✅ 全部通过')
else:
    print('结论: ⚠️ 有异常')
json.dump({'layer1': r1, 'layer2': r2, 'layer3': r3}, open('report.json','w'), indent=2, ensure_ascii=False)
"
echo ""
echo "[完成] 报告: tests/scenarios/report.json"
