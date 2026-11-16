// 并发验收：三人同时登录+训练，以及同一题目并发提交幂等
const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name} ${detail}`); fail++; }
};

async function req(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

async function main() {
  console.log("=== 并发验收 ===");

  // 三人同时登录
  const logins = await Promise.all(
    [1, 2, 3].map((n) => req("/api/auth/login", { method: "POST", body: { username: `student${n}`, password: "Student@2026" } }))
  );
  check("三人同时登录成功", logins.every((l) => l.status === 200), logins.map((l) => l.status).join(","));
  const cookies = logins.map((l) => l.setCookie?.split(";")[0] ?? "");

  // 三人同时拉计划
  const plans = await Promise.all(cookies.map((c) => req("/api/student/plan", { cookie: c })));
  check("三人同时拉计划成功", plans.every((p) => p.status === 200));
  check("计划互不相同（按学生隔离）", new Set(plans.map((p) => p.json?.data?.id)).size === 3);

  // 三人同时创建会话
  const sess = await Promise.all(plans.map((p, i) => req("/api/student/session", {
    method: "POST", body: { planId: p.json.data.id }, cookie: cookies[i],
  })));
  check("三人同时创建会话成功", sess.every((s) => s.status === 201));

  // 同一幂等键并发提交 5 次（模拟重复点击/网络重试）
  const sid = sess[0].json.data.id;
  const qid = plans[0].json.data.items.find((i) => i.questionId)?.questionId;
  if (qid) {
    const key = `concurrent-${Date.now()}`;
    const body = { sessionId: sid, questionId: qid, answer: "1", maxHintLevel: 0, sawSolution: false };
    const subs = await Promise.all(
      Array.from({ length: 5 }, () => req("/api/student/attempt", { method: "POST", body, cookie: cookies[0], headers: { "Idempotency-Key": key } }))
    );
    check("并发提交全部 200", subs.every((s) => s.status === 200), subs.map((s) => s.status).join(","));
    const attemptIds = subs.map((s) => s.json?.data?.attemptId);
    check("并发提交只产生一条 attempt", new Set(attemptIds).size === 1, `unique=${new Set(attemptIds).size}`);
  }

  // 刷新/会话恢复：重新拉取会话
  const recovered = await req(`/api/student/session/${sid}`, { cookie: cookies[0] });
  check("会话恢复（刷新）成功", recovered.status === 200);
  check("恢复后含作答记录", (recovered.json?.data?.attempts ?? []).length >= 1);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
