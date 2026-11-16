// 题目选项的安全解析。
// 历史上选项以 JSON 字符串形式写入 Json 字段（seed 时 JSON.stringify），
// 后台录入接口则可能直接存数组；两种形态都要能正确渲染，不能因为形态不同就崩掉页面。
export type QuestionOption = { key: string; text: string };

export function parseOptions(raw: unknown): QuestionOption[] | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    const list = raw
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .filter((o) => typeof o.key === "string")
      .map((o) => ({ key: o.key as string, text: String(o.text ?? "") }));
    return list.length ? list : null;
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      return parseOptions(JSON.parse(s));
    } catch {
      return null;
    }
  }

  return null;
}
