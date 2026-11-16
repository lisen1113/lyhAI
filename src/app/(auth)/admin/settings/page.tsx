import { DEFAULT_CONFIG } from "@/lib/config";

export default function SettingsPage() {
  const cfg = DEFAULT_CONFIG;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">系统参数</h1>
        <p className="mt-1 text-sm text-slate-500">所有阈值与权重均已配置化。以下为当前生效的默认值（源码 config）。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">每日训练时长（分钟）</h2>
          <div className="space-y-1.5 text-sm">
            {Object.entries(cfg.planBudget).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-slate-600">{k}</span><span className="font-medium">{v}</span></div>
            ))}
            <div className="mt-2 border-t pt-2 flex justify-between"><span className="text-slate-600">总时长范围</span><span className="font-medium">{cfg.planTotalMin}-{cfg.planTotalMax}</span></div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">掌握度更新（delta）</h2>
          <div className="space-y-1.5 text-sm">
            {Object.entries(cfg.delta).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-slate-600">{k}</span><span className="font-medium">{v > 0 ? "+" : ""}{v}</span></div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">间隔复测</h2>
          <div className="text-sm text-slate-600">复测周期：{cfg.reviewIntervals.join(" / ")} 天</div>
          <div className="mt-1 text-sm text-slate-600">Hint 缩短系数：{cfg.hintShrinkFactor}</div>
          <div className="mt-1 text-sm text-slate-600">连续失败回退阈值：{cfg.failStreakToRemedial} 次</div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">动态难度</h2>
          <div className="text-sm text-slate-600">独立率低于 {cfg.lowIndependentThreshold * 100}% 自动降难</div>
          <div className="mt-1 text-sm text-slate-600">高于 {cfg.highIndependentThreshold * 100}% 增加变式</div>
          <div className="mt-1 text-sm text-slate-600">成功体验目标：{cfg.successExperienceMin * 100}%-{cfg.successExperienceMax * 100}%</div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">生产环境可通过 SystemConfig 表覆盖默认值，无需改代码。</p>
    </div>
  );
}
