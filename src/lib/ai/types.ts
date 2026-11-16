// AI Provider/Adapter 抽象层 — 业务代码只依赖此接口，不散落具体 SDK
export interface AIExplainRequest {
  question: string;
  standardAnswer: string;
  standardSolution: string;
  knowledgeNode: string;
  microSkill: string;
  hintLevel: 1 | 2 | 3;
  studentQuestion?: string;
}

export interface AIExplainResponse {
  content: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface AIProvider {
  name: string;
  model: string;
  explain(req: AIExplainRequest): Promise<AIExplainResponse>;
}

// Prompt 版本集中管理
export const PROMPT_VERSION = "v1.0";

export function buildExplainPrompt(req: AIExplainRequest): { system: string; user: string } {
  const levelGuide: Record<number, string> = {
    1: "只给方向提示，不透露关键条件或答案，引导学生自己思考。",
    2: "给出关键条件和需要用到的知识点，但不给完整计算。",
    3: "给出关键公式或解题框架，但保留核心计算/推导由学生完成。",
  };
  const system = `你是一名初中物理化学辅导老师。你必须严格依据提供的标准答案和标准解析进行讲解，不得修改、违背或替代标准答案。讲解要简洁、鼓励式、符合中学生认知。当前提示级别要求：${levelGuide[req.hintLevel]}`;
  const user = `题目：${req.question}\n知识点：${req.knowledgeNode} / ${req.microSkill}\n标准答案：${req.standardAnswer}\n标准解析：${req.standardSolution}\n${req.studentQuestion ? `学生疑问：${req.studentQuestion}\n` : ""}请按提示级别给出讲解。`;
  return { system, user };
}
