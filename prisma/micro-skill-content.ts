// 微知识卡内容汇总入口
export type { SkillContent } from "./micro-skill-content-chemistry";
export { CHEMISTRY_SKILL_CONTENT } from "./micro-skill-content-chemistry";
export { PHYSICS_SKILL_CONTENT } from "./micro-skill-content-physics";

import { CHEMISTRY_SKILL_CONTENT, type SkillContent } from "./micro-skill-content-chemistry";
import { PHYSICS_SKILL_CONTENT } from "./micro-skill-content-physics";

export const ALL_SKILL_CONTENT: Record<string, SkillContent> = {
  ...PHYSICS_SKILL_CONTENT,
  ...CHEMISTRY_SKILL_CONTENT,
};
