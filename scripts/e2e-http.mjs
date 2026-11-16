// 端到端 HTTP 测试：完整闭环（登录→计划→会话→答题→Hint→掌握度→Admin→测验）
const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name} ${detail}`); fail++; }
};

async function req(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, json, setCookie };
}

async function main() {
  console.log("=== E2E 完整闭环 ===");

  // 1. 学生登录
  const sl = await req("/api/auth/login", { method: "POST", body: { username: "__verify", password: "verify-only-not-for-login" } });
  check("学生登录 200", sl.status === 200, `status=${sl.status}`);
  const stuCookie = sl.setCookie?.split(";")[0] ?? "";
  check("返回 STUDENT 角色", sl.json?.data?.user?.role === "STUDENT");

  // 2. 管理员登录
  const al = await req("/api/auth/login", { method: "POST", body: { username: "lisen", password: "123456" } });
  const adminCookie = al.setCookie?.split(";")[0] ?? "";
  check("管理员登录 200", al.status === 200 && adminCookie.length > 0);

  // 3. 错误密码（用一个明显错误的口令，绝不能填真实密码，否则这条断言永远失败）
  const bad = await req("/api/auth/login", { method: "POST", body: { username: "lisen", password: "not-the-real-password" } });
  check("错误密码 401", bad.status === 401);

  // 4. 未登录访问计划
  const noAuth = await req("/api/student/plan");
  check("未登录计划接口 401", noAuth.status === 401);

  // 5. 拉今日计划
  const plan = await req("/api/student/plan", { cookie: stuCookie });
  check("今日计划 200", plan.status === 200, `status=${plan.status}`);
  check("计划时长 25-35", plan.json?.data?.totalMinutes >= 25 && plan.json?.data?.totalMinutes <= 35, `min=${plan.json?.data?.totalMinutes}`);
  const items = plan.json?.data?.items ?? [];
  check("计划含题目", items.length > 0, `items=${items.length}`);

  // 6. 创建会话
  const sess = await req("/api/student/session", { method: "POST", body: { planId: plan.json.data.id }, cookie: stuCookie });
  check("创建会话 201", sess.status === 201, `status=${sess.status}`);
  const sessionId = sess.json?.data?.id;

  // 7. 取一道题
  const questionItem = items.find((i) => i.questionId);
  if (questionItem) {
    const qres = await req(`/api/student/question?id=${questionItem.questionId}`, { cookie: stuCookie });
    check("获取题目 200", qres.status === 200, `status=${qres.status}`);
    check("题目不含标准答案", qres.json?.data?.standardAnswer === undefined);

    // 8. 首次独立答对（从题库取标准答案数值 — 用 admin API 找答案）
    const qid = questionItem.questionId;

    // 9. AI 讲解（fallback）
    const ex = await req("/api/student/explain", { method: "POST", body: { questionId: qid, level: 1 }, cookie: stuCookie });
    check("AI 讲解接口 200（降级不中断）", ex.status === 200, `status=${ex.status}`);
    check("讲解有内容", (ex.json?.data?.content ?? "").length > 0);
  }

  // 10. 学生掌握度（中性）
  const mastery = await req("/api/student/mastery", { cookie: stuCookie });
  check("掌握度接口 200", mastery.status === 200);
  check("无数值分数泄漏", JSON.stringify(mastery.json).indexOf("masteryScore") === -1);

  // 11. 复测接口
  const review = await req("/api/student/review", { cookie: stuCookie });
  check("复测接口 200", review.status === 200);

  // 12. 学生访问 admin 被拒（角色隔离）
  const forbidden = await req("/api/admin/questions", { cookie: stuCookie });
  check("学生访问 admin API 403", forbidden.status === 403, `status=${forbidden.status}`);

  // 13. Admin 拉题库
  const bank = await req("/api/admin/questions?pageSize=5", { cookie: adminCookie });
  check("Admin 题库 200", bank.status === 200, `status=${bank.status}`);
  check("题库有题目", (bank.json?.data?.total ?? 0) >= 200, `total=${bank.json?.data?.total}`);

  // 14. Admin 知识树
  const kn = await req("/api/admin/knowledge", { cookie: adminCookie });
  check("Admin 知识树 200", kn.status === 200);
  check("知识节点丰富", (kn.json?.data?.nodes ?? []).length > 100, `nodes=${kn.json?.data?.nodes?.length}`);

  // 15. Admin 创建测验
  const assess = await req("/api/admin/assessments", { method: "POST", body: { title: "E2E物理周测", type: "WEEKLY", subjectCode: "PH", questionCount: 5 }, cookie: adminCookie });
  check("Admin 创建测验 201", assess.status === 201, `status=${assess.status}`);
  check("测验含 5 题", (assess.json?.data?.questions ?? []).length === 5);

  // 16. 学生看到测验
  const stuAssess = await req("/api/student/assessment", { cookie: stuCookie });
  check("学生查看测验 200", stuAssess.status === 200);

  // 17. 重复提交幂等（用相同 idempotency-key 提交两次）
  if (questionItem) {
    const key = `e2e-${Date.now()}`;
    const body = { sessionId, questionId: questionItem.questionId, answer: "test", maxHintLevel: 0, sawSolution: false };
    const a1 = await req("/api/student/attempt", { method: "POST", body, cookie: stuCookie, headers: { "Idempotency-Key": key } });
    const a2 = await req("/api/student/attempt", { method: "POST", body, cookie: stuCookie, headers: { "Idempotency-Key": key } });
    check("首次提交 200", a1.status === 200, `status=${a1.status}`);
    check("幂等重复提交 200", a2.status === 200);
    check("幂等返回同一 attempt", a1.json?.data?.attemptId === a2.json?.data?.attemptId);
    check("幂等标记", a2.json?.data?.alreadySubmitted === true);
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
