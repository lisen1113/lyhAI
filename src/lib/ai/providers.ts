// AI Provider 实现 — OpenAI 兼容接口 / Azure OpenAI，以及 None（强制 fallback）
import type { AIProvider, AIExplainRequest, AIExplainResponse } from "./types";
import { PROMPT_VERSION, buildExplainPrompt } from "./types";

/** OpenAI 兼容 Chat Completions Provider */
class OpenAICompatProvider implements AIProvider {
  name: string;
  model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: { name: string; model: string; baseUrl: string; apiKey: string }) {
    this.name = opts.name;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  async explain(req: AIExplainRequest): Promise<AIExplainResponse> {
    const start = Date.now();
    const { system, user } = buildExplainPrompt(req);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI empty response");
    return {
      content,
      provider: this.name,
      model: this.model,
      promptVersion: PROMPT_VERSION,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      latencyMs: Date.now() - start,
    };
  }
}

/** 无 Provider：直接抛错，触发 fallback */
class NoneProvider implements AIProvider {
  name = "none";
  model = "none";
  async explain(): Promise<AIExplainResponse> {
    throw new Error("AI provider disabled");
  }
}

/** 工厂：根据环境变量创建 Provider */
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "none";
  if (provider === "none" || !process.env.AI_API_KEY) return new NoneProvider();
  const baseUrl =
    provider === "azure"
      ? process.env.AI_BASE_URL ?? ""
      : process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  return new OpenAICompatProvider({
    name: provider,
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    baseUrl,
    apiKey: process.env.AI_API_KEY,
  });
}
