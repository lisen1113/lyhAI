// AI Tutor 服务 — 递进讲解，失败自动 fallback 到固定 Hint + 标准解析，训练不中断
import { prisma } from "@/lib/db";
import { createAIProvider } from "./providers";
import type { AIExplainRequest } from "./types";
import { PROMPT_VERSION } from "./types";

export interface TutorResult {
  content: string;
  source: "AI" | "FIXED";
  provider: string;
  promptVersion: string;
}

/**
 * 获取递进讲解。AI 失败/禁用时降级到标准解析或固定 Hint，不抛错。
 * 每次调用都写 AIInteractionLog（含失败）。
 */
export async function explain(params: {
  request: AIExplainRequest;
  fixedHint?: string;
  studentId?: string;
  attemptId?: string;
}): Promise<TutorResult> {
  const provider = createAIProvider();
  const start = Date.now();

  try {
    const result = await provider.explain(params.request);
    await prisma.aIInteractionLog.create({
      data: {
        studentId: params.studentId ?? null,
        attemptId: params.attemptId ?? null,
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        input: JSON.stringify(params.request),
        output: result.content,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        latencyMs: result.latencyMs,
        status: "SUCCESS",
      },
    });
    return { content: result.content, source: "AI", provider: result.provider, promptVersion: result.promptVersion };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    // 记录失败
    await prisma.aIInteractionLog.create({
      data: {
        studentId: params.studentId ?? null,
        attemptId: params.attemptId ?? null,
        provider: provider.name,
        model: provider.model,
        promptVersion: PROMPT_VERSION,
        input: JSON.stringify(params.request),
        output: null,
        latencyMs,
        status: "FAILURE",
        error: errMsg,
      },
    });
    // Fallback：固定 Hint 优先，否则标准解析
    const fallback = params.fixedHint || params.request.standardSolution;
    return {
      content: fallback,
      source: "FIXED",
      provider: provider.name,
      promptVersion: PROMPT_VERSION,
    };
  }
}
