// 测试题库生成器 — 参数化变式，覆盖物理/化学核心计算与概念题
// 每题可自动判分：数值题（带容差）、选择题、判断题
import type { QuestionType, Difficulty } from "@prisma/client";

export type GenQuestion = {
  key: string;              // 幂等键
  nodeCode: string;         // 关联知识点 code
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  options?: { key: string; text: string }[];
  answer: string;
  answerNumeric?: number;   // 数值答案（判分用）
  tolerance?: number;       // 数值容差
  solution: string;
  hints: [string, string, string, string];
  variantGroup?: string;    // 变式分组
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

// ============ 物理计算题 ============
function physicsGravity(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const masses = [1, 2, 3, 5, 4, 6, 7.5, 8, 10, 12];
  masses.forEach((m, i) => {
    const g = 9.8;
    const ans = round(m * g, 1);
    out.push({
      key: `PQ-G-${i}`, nodeCode: "PH-M07-U01-K02", type: "NUMERIC", difficulty: "L1",
      stem: `一个质量为 ${m}kg 的物体静止在水平地面上，它受到的重力是多少牛顿？（g 取 9.8N/kg）`,
      answer: `${ans}N`, answerNumeric: ans, tolerance: 0.2,
      solution: `已知 m=${m}kg，g=9.8N/kg。由 G=m·g 得 G=${m}×9.8=${ans}N，方向竖直向下。`,
      hints: ["重力跟哪个物理量成正比？", "重力方向竖直向下，G=m·g。", "代入 G=m·g，g=9.8N/kg。", `完整解析：G=${m}×9.8=${ans}N，方向竖直向下。常见错误：把质量当重力、漏单位。`],
      variantGroup: "gravity-G",
    });
  });
  return out;
}

function physicsSpeed(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[100, 20], [360, 40], [72, 30], [500, 25], [90, 15], [200, 40], [150, 30], [300, 50], [120, 24], [800, 100]];
  data.forEach(([s, t], i) => {
    const v = round(s / t, 2);
    out.push({
      key: `PQ-V-${i}`, nodeCode: "PH-M02-U01-K02", type: "NUMERIC", difficulty: "L1",
      stem: `一辆汽车在平直公路上匀速行驶，${t}s 内通过的路程是 ${s}m，它的速度是多少 m/s？`,
      answer: `${v}m/s`, answerNumeric: v, tolerance: 0.05,
      solution: `已知 s=${s}m，t=${t}s。由 v=s/t 得 v=${s}/${t}=${v}m/s。`,
      hints: ["速度等于什么除以什么？", "速度描述运动的快慢。", "使用公式 v=s/t。", `完整解析：v=${s}/${t}=${v}m/s。注意单位统一。`],
      variantGroup: "speed-v",
    });
  });
  return out;
}

function physicsDensity(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[270, 100], [780, 100], [540, 200], [890, 100], [360, 120], [1080, 400], [1960, 200], [450, 150], [1560, 200], [720, 90]];
  data.forEach(([m, v], i) => {
    const rho = round(m / v, 2);
    out.push({
      key: `PQ-RHO-${i}`, nodeCode: "PH-M06-U01-K01", type: "NUMERIC", difficulty: "L2",
      stem: `一块物体的质量为 ${m}g，体积为 ${v}cm³，它的密度是多少 g/cm³？`,
      answer: `${rho}g/cm³`, answerNumeric: rho, tolerance: 0.02,
      solution: `已知 m=${m}g，V=${v}cm³。由 ρ=m/V 得 ρ=${m}/${v}=${rho}g/cm³。`,
      hints: ["密度是物质的什么特性？", "密度等于质量与体积之比。", "使用公式 ρ=m/V。", `完整解析：ρ=${m}/${v}=${rho}g/cm³。密度不随质量体积改变。`],
      variantGroup: "density-rho",
    });
  });
  return out;
}

function physicsPressure(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[500, 0.1], [200, 0.05], [800, 0.2], [300, 0.15], [1000, 0.5], [600, 0.3], [450, 0.09], [150, 0.03], [900, 0.45], [240, 0.08]];
  data.forEach(([f, area], i) => {
    const p = round(f / area, 0);
    out.push({
      key: `PQ-P-${i}`, nodeCode: "PH-M09-U01-K01", type: "NUMERIC", difficulty: "L2",
      stem: `一物体对水平面的压力为 ${f}N，受力面积为 ${area}m²，它产生的压强是多少 Pa？`,
      answer: `${p}Pa`, answerNumeric: p, tolerance: 1,
      solution: `已知 F=${f}N，S=${area}m²。由 p=F/S 得 p=${f}/${area}=${p}Pa。`,
      hints: ["压强与压力和受力面积有什么关系？", "受力面积越大压强越小。", "使用公式 p=F/S。", `完整解析：p=${f}/${area}=${p}Pa。压力不一定等于重力。`],
      variantGroup: "pressure-p",
    });
  });
  return out;
}

function physicsOhm(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[6, 3], [12, 4], [9, 3], [24, 6], [15, 5], [3, 1.5], [18, 9], [36, 12], [5, 2.5], [48, 8]];
  data.forEach(([u, r], i) => {
    const cur = round(u / r, 2);
    out.push({
      key: `PQ-I-${i}`, nodeCode: "PH-M17-U01-K01", type: "NUMERIC", difficulty: "L2",
      stem: `一段导体两端电压为 ${u}V，导体电阻为 ${r}Ω，通过导体的电流是多少 A？`,
      answer: `${cur}A`, answerNumeric: cur, tolerance: 0.02,
      solution: `已知 U=${u}V，R=${r}Ω。由 I=U/R 得 I=${u}/${r}=${cur}A。`,
      hints: ["电流与电压、电阻有什么关系？", "电压一定时电阻越大电流越小。", "使用欧姆定律 I=U/R。", `完整解析：I=${u}/${r}=${cur}A。注意公式变形。`],
      variantGroup: "ohm-I",
    });
  });
  return out;
}

function physicsPower(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[220, 5], [12, 3], [36, 2], [110, 4], [220, 10], [6, 0.5], [48, 4], [24, 1.5], [380, 2], [12, 8]];
  data.forEach(([u, i], i2) => {
    const p = round(u * i, 1);
    out.push({
      key: `PQ-PW-${i2}`, nodeCode: "PH-M18-U01-K02", type: "NUMERIC", difficulty: "L2",
      stem: `某用电器两端电压为 ${u}V，通过的电流为 ${i}A，它的电功率是多少 W？`,
      answer: `${p}W`, answerNumeric: p, tolerance: 0.5,
      solution: `已知 U=${u}V，I=${i}A。由 P=UI 得 P=${u}×${i}=${p}W。`,
      hints: ["电功率与电压电流有什么关系？", "电功率表示做功的快慢。", "使用公式 P=UI。", `完整解析：P=${u}×${i}=${p}W。`],
      variantGroup: "power-P",
    });
  });
  return out;
}

function physicsWork(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[50, 10], [100, 5], [20, 15], [200, 8], [80, 12], [150, 6], [30, 20], [60, 25], [120, 4], [75, 10]];
  data.forEach(([f, s], i) => {
    const w = round(f * s, 0);
    out.push({
      key: `PQ-W-${i}`, nodeCode: "PH-M12-U01-K01", type: "NUMERIC", difficulty: "L1",
      stem: `用 ${f}N 的水平力推物体，使物体沿力的方向移动 ${s}m，推力做的功是多少 J？`,
      answer: `${w}J`, answerNumeric: w, tolerance: 1,
      solution: `已知 F=${f}N，s=${s}m。由 W=F·s 得 W=${f}×${s}=${w}J。`,
      hints: ["做功需要哪两个条件？", "力和在力方向上的距离。", "使用公式 W=F·s。", `完整解析：W=${f}×${s}=${w}J。`],
      variantGroup: "work-W",
    });
  });
  return out;
}

function physicsHeat(): GenQuestion[] {
  const out: GenQuestion[] = [];
  // c水=4.2×10³ J/(kg·℃)
  const data = [[1, 20], [2, 10], [0.5, 40], [3, 15], [1.5, 30], [2, 25], [4, 10], [0.8, 50], [1, 60], [2.5, 20]];
  data.forEach(([m, dt], i) => {
    const q = round(4200 * m * dt, 0);
    out.push({
      key: `PQ-Q-${i}`, nodeCode: "PH-M14-U02-K01", type: "NUMERIC", difficulty: "L2",
      stem: `将 ${m}kg 的水温度升高 ${dt}℃，需要吸收多少热量？[c水=4.2×10³ J/(kg·℃)]`,
      answer: `${q}J`, answerNumeric: q, tolerance: 100,
      solution: `已知 m=${m}kg，Δt=${dt}℃，c=4.2×10³。由 Q=cmΔt 得 Q=4200×${m}×${dt}=${q}J。`,
      hints: ["热量与比热容、质量、温度变化有关。", "Δt 是温度的变化量。", "使用公式 Q=c·m·Δt。", `完整解析：Q=4200×${m}×${dt}=${q}J。`],
      variantGroup: "heat-Q",
    });
  });
  return out;
}

function physicsBuoyancy(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const vols = [100, 200, 500, 300, 400, 150, 250, 600, 80, 350]; // cm³
  vols.forEach((v, i) => {
    const vM3 = v / 1e6;
    const f = round(1000 * 10 * vM3, 2);
    out.push({
      key: `PQ-FB-${i}`, nodeCode: "PH-M10-U01-K01", type: "NUMERIC", difficulty: "L3",
      stem: `一个物体完全浸没在水中，排开水的体积为 ${v}cm³，它受到的浮力是多少 N？（ρ水=1.0×10³kg/m³，g取10N/kg）`,
      answer: `${f}N`, answerNumeric: f, tolerance: 0.05,
      solution: `V排=${v}cm³=${vM3}m³。由 F浮=ρ水·g·V排=1000×10×${vM3}=${f}N。`,
      hints: ["浮力等于排开液体所受的重力。", "注意把体积换算成 m³。", "使用 F浮=ρ液·g·V排。", `完整解析：V排=${vM3}m³，F浮=1000×10×${vM3}=${f}N。`],
      variantGroup: "buoyancy-F",
    });
  });
  return out;
}

function physicsConcept(): GenQuestion[] {
  const items: Array<[string, string, string[], string, string]> = [
    ["PH-M03-U01-K02", "关于声音的特性，下列说法正确的是：", ["音调由频率决定", "响度由振幅决定", "音色由材料决定", "以上都正确"], "D", "音调由频率决定，响度由振幅决定，音色由发声体材料和结构决定，故都正确。"],
    ["PH-M04-U01-K03", "平面镜所成的像是：", ["倒立放大的实像", "正立等大的虚像", "倒立等大的实像", "正立缩小的虚像"], "B", "平面镜成正立等大的虚像，像与物关于镜面对称。"],
    ["PH-M08-U01-K01", "关于惯性，下列说法正确的是：", ["运动越快惯性越大", "静止的物体没有惯性", "惯性大小只与质量有关", "受力越大惯性越小"], "C", "惯性是物体保持原来运动状态的性质，大小只与质量有关。"],
    ["PH-M15-U02-K01", "电流表在电路中应该：", ["与被测用电器并联", "与被测用电器串联", "直接接在电源两极", "任意连接"], "B", "电流表必须与被测用电器串联，电压表才并联。"],
    ["PH-M17-U01-K03", "家庭电路中，保险丝应接在：", ["零线上", "火线上", "地线上", "任意位置"], "B", "保险丝必须接在火线上，才能在熔断时切断电源保证安全。"],
    ["PH-M20-U01-K02", "奥斯特实验说明：", ["电流周围存在磁场", "磁能生电", "同名磁极相斥", "电磁波能传递信息"], "A", "奥斯特实验说明通电导线周围存在磁场，即电流的磁效应。"],
  ];
  return items.map((it, i) => ({
    key: `PQ-C-${i}`, nodeCode: it[0], type: "SINGLE_CHOICE" as QuestionType, difficulty: "L1" as Difficulty,
    stem: it[1], options: it[2].map((t, j) => ({ key: ["A", "B", "C", "D"][j], text: t })),
    answer: it[3], solution: it[4],
    hints: ["仔细审题，抓住关键词。", "回忆相关的物理概念。", "逐项分析排除错误选项。", `完整解析：${it[4]}`],
    variantGroup: "physics-concept",
  }));
}

// ============ 化学计算题 ============
// 相对分子质量表
const MR: Record<string, number> = {
  "H2O": 18, "CO2": 44, "O2": 32, "H2": 2, "NaCl": 58.5, "NaOH": 40,
  "CaCO3": 56 + 12 + 48, "H2SO4": 98, "HCl": 36.5, "C2H5OH": 46,
};

function chemistryMr(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const entries = Object.entries(MR);
  entries.forEach(([formula, mr], i) => {
    out.push({
      key: `CQ-MR-${i}`, nodeCode: "CH-M06-U01-K03", type: "NUMERIC", difficulty: "L1",
      stem: `计算 ${formula} 的相对分子质量。（相对原子质量：H-1 C-12 O-16 Na-23 S-32 Cl-35.5 Ca-40）`,
      answer: `${mr}`, answerNumeric: mr, tolerance: 0.1,
      solution: `${formula} 的相对分子质量 = ${mr}。`,
      hints: ["相对分子质量等于各原子相对原子质量之和。", "注意乘以下标。", "把各原子的相对原子质量相加。", `完整解析：${formula} 的相对分子质量为 ${mr}。`],
      variantGroup: "chem-mr",
    });
  });
  // 元素质量分数
  out.push({
    key: "CQ-WF-0", nodeCode: "CH-M06-U01-K03", type: "NUMERIC", difficulty: "L2",
    stem: "计算水中氢元素的质量分数。（结果保留一位小数，H-1 O-16）",
    answer: "11.1%", answerNumeric: 11.1, tolerance: 0.2,
    solution: "水中氢元素质量分数 = (1×2)/18 ×100% ≈ 11.1%。",
    hints: ["元素质量分数=相对原子质量×原子个数÷相对分子质量。", "水的相对分子质量是18。", "氢有2个原子。", "完整解析：(1×2)/18×100%≈11.1%。"],
    variantGroup: "chem-massfrac",
  });
  out.push({
    key: "CQ-WF-1", nodeCode: "CH-M06-U01-K03", type: "NUMERIC", difficulty: "L2",
    stem: "计算二氧化碳中碳元素的质量分数。（结果保留一位小数，C-12 O-16）",
    answer: "27.3%", answerNumeric: 27.3, tolerance: 0.2,
    solution: "CO₂中碳元素质量分数 = 12/44 ×100% ≈ 27.3%。",
    hints: ["先算CO₂的相对分子质量。", "CO₂的相对分子质量是44。", "用碳的相对原子质量12除以44。", "完整解析：12/44×100%≈27.3%。"],
    variantGroup: "chem-massfrac",
  });
  return out;
}

function chemistryMassFraction(): GenQuestion[] {
  const out: GenQuestion[] = [];
  const data = [[10, 90], [20, 80], [5, 95], [25, 75], [15, 85], [30, 70], [8, 92], [12, 88], [40, 60], [18, 82]];
  data.forEach(([ms, mw], i) => {
    const w = round((ms / (ms + mw)) * 100, 1);
    out.push({
      key: `CQ-MF-${i}`, nodeCode: "CH-M10-U02-K02", type: "NUMERIC", difficulty: "L2",
      stem: `将 ${ms}g 食盐溶解在 ${mw}g 水中，所得溶液的溶质质量分数是多少？（结果保留一位小数）`,
      answer: `${w}%`, answerNumeric: w, tolerance: 0.2,
      solution: `溶质质量分数 = ${ms}/(${ms}+${mw})×100% = ${w}%。`,
      hints: ["溶液质量=溶质质量+溶剂质量。", "溶质是食盐。", "用溶质质量除以溶液质量。", `完整解析：${ms}/${ms + mw}×100%=${w}%。`],
      variantGroup: "chem-mf",
    });
  });
  return out;
}

function chemistryConcept(): GenQuestion[] {
  const items: Array<[string, string, string[], string, string]> = [
    ["CH-M01-U01-K01", "下列变化中，属于化学变化的是：", ["冰融化成水", "纸张燃烧", "玻璃破碎", "酒精挥发"], "B", "纸张燃烧生成了新物质，属于化学变化。"],
    ["CH-M03-U02-K01", "检验氧气常用的方法是：", ["倒入澄清石灰水", "将带火星的木条伸入瓶中", "闻气味", "观察颜色"], "B", "氧气具有助燃性，能使带火星的木条复燃。"],
    ["CH-M07-U02-K03", "下列反应属于化合反应的是：", ["分解水制氧气", "碳与氧气反应生成二氧化碳", "置换出铜", "中和反应"], "B", "化合反应是两种或多种物质生成一种物质的反应。"],
    ["CH-M05-U01-K01", "保持物质化学性质的最小粒子是：", ["原子", "分子", "离子", "电子"], "B", "分子是保持物质化学性质的最小粒子。"],
    ["CH-M09-U01-K03", "下列金属活动性最强的是：", ["铜", "铁", "锌", "银"], "C", "金属活动性顺序中锌排在铁、铜、银前面。"],
    ["CH-M11-U01-K03", "酸与碱作用生成盐和水的反应叫做：", ["化合反应", "分解反应", "中和反应", "置换反应"], "C", "酸与碱生成盐和水的反应是中和反应。"],
    ["CH-M11-U02-K02", "复分解反应能够发生的条件是生成物中有：", ["气体", "沉淀", "水", "以上任一即可"], "D", "生成沉淀、气体或水，复分解反应即可发生。"],
    ["CH-M03-U01-K01", "空气中体积分数最大的气体是：", ["氧气", "氮气", "二氧化碳", "稀有气体"], "B", "空气中氮气约占78%，体积分数最大。"],
  ];
  return items.map((it, i) => ({
    key: `CQ-C-${i}`, nodeCode: it[0], type: "SINGLE_CHOICE" as QuestionType, difficulty: "L1" as Difficulty,
    stem: it[1], options: it[2].map((t, j) => ({ key: ["A", "B", "C", "D"][j], text: t })),
    answer: it[3], solution: it[4],
    hints: ["仔细审题，抓住关键词。", "回忆相关的化学概念。", "逐项分析排除错误选项。", `完整解析：${it[4]}`],
    variantGroup: "chem-concept",
  }));
}

function chemistryEquation(): GenQuestion[] {
  // 配平题（填空）
  const items: Array<[string, string, string]> = [
    ["配平：___H₂ + O₂ 点燃 ___H₂O，横线上应填的系数是：", "2", "2H₂+O₂点燃2H₂O，氢气系数为2。"],
    ["配平：___Fe + O₂ 点燃 ___Fe₃O₄，铁前面的系数是：", "3", "3Fe+2O₂点燃Fe₃O₄，铁系数为3。"],
    ["配平：___KClO₃ △ ___KCl + ___O₂，氯酸钾的系数是：", "2", "2KClO₃ △ 2KCl+3O₂，系数为2。"],
    ["配平：___CO + O₂ 点燃 ___CO₂，一氧化碳的系数是：", "2", "2CO+O₂点燃2CO₂。"],
  ];
  return items.map((it, i) => ({
    key: `CQ-EQ-${i}`, nodeCode: "CH-M07-U02-K02", type: "FILL_BLANK" as QuestionType, difficulty: "L2" as Difficulty,
    stem: it[0], answer: it[1], solution: it[2],
    hints: ["根据质量守恒定律配平。", "先配平出现次数少的元素。", "系数是最简整数比。", `完整解析：${it[2]}`],
    variantGroup: "chem-balance",
  }));
}

// ============ 物理判断题 ============
function physicsTrueFalse(): GenQuestion[] {
  const items: Array<[string, string, string, string]> = [
    ["PH-M01-U01-K01", "用刻度尺测量长度时，读数视线要正对刻度线。", "正确", "视线正对刻度线才能准确读数。"],
    ["PH-M02-U01-K01", "运动和静止是相对的，取决于所选的参照物。", "正确", "参照物不同，对运动的判断可能不同。"],
    ["PH-M03-U01-K01", "声音可以在真空中传播。", "错误", "声音传播需要介质，真空不能传声。"],
    ["PH-M04-U01-K02", "镜面反射和漫反射都遵守光的反射定律。", "正确", "所有反射都遵守反射定律。"],
    ["PH-M05-U01-K01", "近视眼应该用凸透镜矫正。", "错误", "近视眼用凹透镜矫正。"],
    ["PH-M06-U01-K01", "密度是物质的特性，不随质量和体积改变。", "正确", "同种物质密度一定。"],
    ["PH-M07-U01-K02", "重力的方向总是垂直向下。", "错误", "重力方向是竖直向下，不是垂直向下。"],
    ["PH-M08-U01-K01", "物体的运动需要力来维持。", "错误", "力是改变运动状态的原因，不是维持运动的原因。"],
    ["PH-M09-U01-K01", "压力的方向总是竖直向下。", "错误", "压力方向垂直于接触面指向受力物体。"],
    ["PH-M10-U01-K01", "物体浸没在液体中越深，所受浮力越大。", "错误", "浸没后浮力与深度无关，只与V排有关。"],
    ["PH-M11-U01-K01", "力臂是支点到力的作用点的距离。", "错误", "力臂是支点到力的作用线的垂直距离。"],
    ["PH-M13-U02-K02", "水沸腾时继续吸热但温度保持不变。", "正确", "沸腾时吸热用于汽化，温度不变。"],
    ["PH-M16-U01-K02", "滑动变阻器能改变接入电路的电阻。", "正确", "通过改变接入电阻线长度改变电阻。"],
    ["PH-M18-U01-K02", "用电器的实际功率一定等于额定功率。", "错误", "实际电压不等于额定电压时实际功率不同。"],
  ];
  return items.map((it, i) => ({
    key: `PQ-TF-${i}`, nodeCode: it[0], type: "TRUE_FALSE" as QuestionType, difficulty: "L1" as Difficulty,
    stem: it[1] + "（判断正误）", answer: it[2], solution: it[3],
    hints: ["仔细判断这句话是否符合物理规律。", "回忆相关的概念和规律。", "找一个反例验证。", `完整解析：${it[3]}`],
    variantGroup: "physics-tf",
  }));
}

function physicsExtraCalc(): GenQuestion[] {
  const out: GenQuestion[] = [];
  // 电功 W=UIt
  const wData = [[220, 2, 60], [12, 3, 100], [36, 1, 50], [110, 4, 30], [6, 0.5, 200]];
  wData.forEach(([u, i, t], n) => {
    const w = round(u * i * t, 0);
    out.push({
      key: `PQ-WE-${n}`, nodeCode: "PH-M18-U01-K01", type: "NUMERIC", difficulty: "L2",
      stem: `某用电器两端电压 ${u}V，电流 ${i}A，通电 ${t}s，电流做功多少 J？`,
      answer: `${w}J`, answerNumeric: w, tolerance: 1,
      solution: `W=UIt=${u}×${i}×${t}=${w}J。`,
      hints: ["电功与电压电流时间有关。", "使用公式 W=UIt。", "三个量相乘。", `完整解析：W=${u}×${i}×${t}=${w}J。`],
      variantGroup: "elec-work",
    });
  });
  // 机械效率 η=W有/W总
  const eData = [[800, 1000], [450, 600], [900, 1200], [180, 240], [1500, 2000]];
  eData.forEach(([wy, wz], n) => {
    const eta = round((wy / wz) * 100, 1);
    out.push({
      key: `PQ-ETA-${n}`, nodeCode: "PH-M12-U01-K03", type: "NUMERIC", difficulty: "L2",
      stem: `某机械做功时，有用功为 ${wy}J，总功为 ${wz}J，其机械效率是多少？（结果保留一位小数）`,
      answer: `${eta}%`, answerNumeric: eta, tolerance: 0.2,
      solution: `η=W有/W总×100%=${wy}/${wz}×100%≈${eta}%。`,
      hints: ["机械效率是有用功与总功的比值。", "总功大于有用功。", "用有用功除以总功。", `完整解析：η=${wy}/${wz}×100%≈${eta}%。`],
      variantGroup: "eta",
    });
  });
  return out;
}

// ============ 化学判断题 ============
function chemistryTrueFalse(): GenQuestion[] {
  const items: Array<[string, string, string, string]> = [
    ["CH-M01-U01-K01", "有新物质生成的变化一定是化学变化。", "正确", "化学变化的本质特征是有新物质生成。"],
    ["CH-M05-U01-K02", "原子在化学变化中不可再分。", "正确", "原子是化学变化中的最小粒子。"],
    ["CH-M05-U02-K01", "元素是质子数相同的一类原子的总称。", "正确", "元素是具有相同核电荷数（质子数）的一类原子的总称。"],
    ["CH-M06-U01-K01", "化合物中化合价的代数和为零。", "正确", "化合物中正负化合价代数和为零。"],
    ["CH-M07-U01-K01", "化学反应前后分子的种类一定不变。", "错误", "原子种类不变，分子种类一般改变。"],
    ["CH-M10-U01-K01", "溶液一定是无色透明的。", "错误", "溶液均一稳定透明，但不一定无色，如硫酸铜溶液呈蓝色。"],
    ["CH-M10-U02-K01", "温度升高，大多数固体物质的溶解度增大。", "正确", "大多数固体溶解度随温度升高而增大。"],
    ["CH-M11-U01-K03", "中和反应一定生成盐和水。", "正确", "酸与碱反应生成盐和水。"],
    ["CH-M11-U02-K02", "有沉淀生成的反应一定是复分解反应。", "错误", "不一定是复分解反应。"],
    ["CH-M03-U02-K01", "氧气具有可燃性。", "错误", "氧气具有助燃性，本身不可燃。"],
    ["CH-M08-U02-K02", "二氧化碳能使澄清石灰水变浑浊。", "正确", "生成碳酸钙沉淀使石灰水变浑浊。"],
    ["CH-M09-U01-K03", "铁能把硫酸铜溶液中的铜置换出来。", "正确", "铁的金属活动性强于铜。"],
    ["CH-M02-U01-K01", "稀释浓硫酸时应把水倒入浓硫酸中。", "错误", "应把浓硫酸沿器壁缓缓注入水中并搅拌。"],
    ["CH-M04-U01-K01", "电解水时正极产生氢气。", "错误", "正极产生氧气，负极产生氢气。"],
    ["CH-M06-U01-K03", "相对分子质量的单位是克。", "错误", "相对分子质量没有单位。"],
    ["CH-M12-U01-K01", "用排水法收集气体要求气体不易溶于水。", "正确", "排水法适用于不易溶于水的气体。"],
  ];
  return items.map((it, i) => ({
    key: `CQ-TF-${i}`, nodeCode: it[0], type: "TRUE_FALSE" as QuestionType, difficulty: "L1" as Difficulty,
    stem: it[1] + "（判断正误）", answer: it[2], solution: it[3],
    hints: ["仔细判断这句话是否符合化学规律。", "回忆相关的概念。", "找一个反例验证。", `完整解析：${it[3]}`],
    variantGroup: "chem-tf",
  }));
}

function chemistryEquationCalc(): GenQuestion[] {
  const out: GenQuestion[] = [];
  // 根据方程式计算（简化质量关系）
  const cases: Array<[string, number, number, string, string]> = [
    ["CaCO₃ → CaO + CO₂↑，要制得 56g CaO，需要分解多少克 CaCO₃？（相对分子质量：CaCO₃=100，CaO=56）", 100, 56, "100g", "CaCO₃与CaO质量比为100:56，制得56g CaO需100g CaCO₃。"],
    ["2H₂ + O₂ → 2H₂O，4g 氢气完全燃烧需要多少克氧气？", 32, 4, "32g", "H₂与O₂质量比为4:32，4g H₂需32g O₂。"],
    ["Zn + H₂SO₄ → ZnSO₄ + H₂↑，6.5g 锌完全反应能制得多少克氢气？（Zn-65）", 2, 65, "0.2g", "Zn与H₂质量比为65:2，6.5g Zn制得0.2g H₂。"],
    ["2KMnO₄ → K₂MnO₄+MnO₂+O₂↑，完全分解31.6g KMnO₄能制得多少克氧气？（KMnO₄=158）", 32, 316, "3.2g", "KMnO₄与O₂质量比为316:32，31.6g制得3.2g O₂。"],
    ["Fe + CuSO₄ → FeSO₄ + Cu，5.6g 铁完全反应能置换出多少克铜？（Fe-56 Cu-64）", 64, 56, "6.4g", "Fe与Cu质量比为56:64，5.6g Fe置换6.4g Cu。"],
    ["C + O₂ → CO₂，3g 碳完全燃烧需要多少克氧气？", 32, 12, "8g", "C与O₂质量比为12:32，3g C需8g O₂。"],
    ["2Mg + O₂ → 2MgO，4.8g 镁完全燃烧生成多少克氧化镁？（Mg-24 MgO-40）", 80, 48, "8g", "Mg与MgO质量比为48:80，4.8g Mg生成8g MgO。"],
    ["H₂CO₃ → H₂O + CO₂↑，6.2g 碳酸分解能生成多少克二氧化碳？", 44, 62, "4.4g", "H₂CO₃与CO₂质量比为62:44，6.2g生成4.4g CO₂。"],
  ];
  cases.forEach((c, i) => out.push({
    key: `CQ-EC-${i}`, nodeCode: "CH-M07-U02-K04", type: "NUMERIC", difficulty: "L3",
    stem: c[0], answer: c[3], answerNumeric: parseFloat(c[3]), tolerance: 0.05,
    solution: c[4],
    hints: ["先写出化学方程式并配平。", "找出已知物和未知物的质量关系。", "用质量比列比例式。", `完整解析：${c[4]}`],
    variantGroup: "chem-eqcalc",
  }));
  // 溶解度计算
  const solCases: Array<[string, number]> = [
    ["20℃时NaCl的溶解度为36g，该温度下100g水中最多能溶解多少克NaCl？", 36],
    ["20℃时KNO₃溶解度为31.6g，50g水中最多溶解多少克KNO₃？", 15.8],
    ["某温度时100g水中溶解25g溶质达到饱和，该温度时该物质的溶解度是多少g？", 25],
    ["60℃时KNO₃溶解度为110g，200g水中最多溶解多少克KNO₃？", 220],
  ];
  solCases.forEach((c, i) => out.push({
    key: `CQ-SOL-${i}`, nodeCode: "CH-M10-U02-K01", type: "NUMERIC", difficulty: "L2",
    stem: c[0], answer: `${c[1]}g`, answerNumeric: c[1], tolerance: 0.2,
    solution: `根据溶解度定义计算，答案为 ${c[1]}g。`,
    hints: ["溶解度是指100g溶剂中达到饱和时溶解的溶质质量。", "注意溶剂质量是否是100g。", "按比例换算。", `完整解析：答案为 ${c[1]}g。`],
    variantGroup: "chem-sol",
  }));
  return out;
}

function chemistryComposition(): GenQuestion[] {
  // 元素质量计算
  const out: GenQuestion[] = [];
  const cases: Array<[string, number]> = [
    ["18g 水中含有多少克氢元素？（H₂O中氢元素质量分数约11.1%）", 2],
    ["44g 二氧化碳中含有多少克碳元素？", 12],
    ["58.5g 氯化钠中含有多少克钠元素？（Na-23 Cl-35.5）", 23],
    ["80g 氧化铜中含有多少克铜元素？（CuO中Cu的质量分数80%）", 64],
    ["98g 硫酸中含有多少克氢元素？", 2],
    ["100g 碳酸钙中含有多少克钙元素？", 40],
  ];
  cases.forEach((c, i) => out.push({
    key: `CQ-COMP-${i}`, nodeCode: "CH-M06-U01-K03", type: "NUMERIC", difficulty: "L2",
    stem: c[0], answer: `${c[1]}g`, answerNumeric: c[1], tolerance: 0.2,
    solution: `元素质量=物质质量×该元素质量分数=${c[1]}g。`,
    hints: ["先算出该元素的质量分数。", "元素质量=物质质量×质量分数。", "注意化学式中的原子个数。", `完整解析：含该元素 ${c[1]}g。`],
    variantGroup: "chem-composition",
  }));
  // 化学式书写填空
  const formulas: Array<[string, string]> = [
    ["钠元素(+1价)与氯元素(-1价)组成的化合物的化学式是：", "NaCl"],
    ["镁元素(+2价)与氧元素(-2价)组成的化合物的化学式是：", "MgO"],
    ["铝元素(+3价)与氧元素(-2价)组成的化合物的化学式是：", "Al2O3"],
    ["钙元素(+2价)与氢氧根(-1价)组成的化合物的化学式是：", "Ca(OH)2"],
    ["钠元素(+1价)与碳酸根(-2价)组成的化合物的化学式是：", "Na2CO3"],
    ["氢元素(+1价)与硫酸根(-2价)组成的化合物的化学式是：", "H2SO4"],
  ];
  formulas.forEach((f, i) => out.push({
    key: `CQ-FORMULA-${i}`, nodeCode: "CH-M06-U01-K02", type: "FILL_BLANK", difficulty: "L2",
    stem: f[0], answer: f[1], solution: `根据化合价代数和为零，化学式为 ${f[1]}。`,
    hints: ["正价元素写前面，负价写后面。", "化合价交叉约简。", "原子团要加括号。", `完整解析：化学式为 ${f[1]}。`],
    variantGroup: "chem-formula",
  }));
  return out;
}

function chemistryMoreConcept(): GenQuestion[] {
  const items: Array<[string, string, string[], string, string]> = [
    ["CH-M02-U01-K02", "给试管中的液体加热时，液体体积一般不超过试管容积的：", ["1/2", "1/3", "2/3", "满管"], "B", "给试管液体加热时液体不超过试管容积的1/3。"],
    ["CH-M05-U01-K03", "某元素原子失去2个电子后，该离子带：", ["2个单位正电荷", "2个单位负电荷", "不带电", "1个单位正电荷"], "A", "失去2个电子带2个单位正电荷，形成阳离子。"],
    ["CH-M08-U02-K03", "实验室制取二氧化碳常用的药品是：", ["大理石和稀盐酸", "碳酸钠和稀盐酸", "大理石和稀硫酸", "木炭燃烧"], "A", "用大理石（或石灰石）和稀盐酸，反应速度适中便于收集。"],
    ["CH-M09-U01-K02", "不能用铁桶盛放硫酸铜溶液的原因是：", ["铁会与硫酸铜反应", "铁会溶解", "硫酸铜有腐蚀性", "铁会生锈"], "A", "铁能置换出硫酸铜中的铜，使溶液变质且铁桶被腐蚀。"],
    ["CH-M10-U02-K01", "一定温度下，将不饱和溶液变成饱和溶液的方法不可行的是：", ["增加溶质", "蒸发溶剂", "降低温度", "增加溶剂"], "D", "增加溶剂会使溶液更不饱和。"],
    ["CH-M11-U02-K03", "除去二氧化碳中混有的少量水蒸气，可用的试剂是：", ["浓硫酸", "澄清石灰水", "氢氧化钠溶液", "水"], "A", "浓硫酸具有吸水性且不与二氧化碳反应。"],
    ["CH-M12-U01-K01", "收集难溶于水的气体，宜采用：", ["向上排空气法", "向下排空气法", "排水法", "任意方法"], "C", "排水法收集的气体较纯，适用于难溶于水的气体。"],
    ["CH-M03-U02-K02", "实验室用高锰酸钾制取氧气时，试管口略向下倾斜的目的是：", ["便于加热", "防止冷凝水倒流炸裂试管", "加快反应", "收集氧气"], "B", "防止冷凝水倒流使试管炸裂。"],
    ["CH-M06-U01-K01", "在化合物中，各元素正负化合价的代数和等于：", ["1", "0", "-1", "原子个数"], "B", "化合物中各元素化合价代数和为零。"],
    ["CH-M07-U02-K03", "反应 2Mg+O₂→2MgO 属于：", ["化合反应", "分解反应", "置换反应", "复分解反应"], "A", "两种物质生成一种物质，属于化合反应。"],
    ["CH-M04-U01-K01", "区分硬水和软水常用的试剂是：", ["肥皂水", "石蕊试液", "澄清石灰水", "酚酞"], "A", "加肥皂水，泡沫多的是软水，泡沫少浮渣多的是硬水。"],
    ["CH-M11-U01-K02", "氢氧化钠固体暴露在空气中会潮解并变质，变质是因为与什么反应：", ["氧气", "水蒸气", "二氧化碳", "氮气"], "C", "氢氧化钠与空气中的二氧化碳反应生成碳酸钠。"],
  ];
  return items.map((it, i) => ({
    key: `CQ-MC-${i}`, nodeCode: it[0], type: "SINGLE_CHOICE" as QuestionType, difficulty: "L2" as Difficulty,
    stem: it[1], options: it[2].map((t, j) => ({ key: ["A", "B", "C", "D"][j], text: t })),
    answer: it[3], solution: it[4],
    hints: ["仔细审题，抓住关键词。", "回忆相关化学知识。", "逐项分析排除。", `完整解析：${it[4]}`],
    variantGroup: "chem-more-concept",
  }));
}

function chemistryCalcMore(): GenQuestion[] {
  const out: GenQuestion[] = [];
  // 溶解度曲线相关计算
  const data = [[36, 50], [36, 200], [31.6, 100], [25, 80], [110, 50], [20, 150], [40, 75], [60, 25]];
  data.forEach(([sol, water], i) => {
    const max = round((sol / 100) * water, 1);
    out.push({
      key: `CQ-SC-${i}`, nodeCode: "CH-M10-U02-K01", type: "NUMERIC", difficulty: "L2",
      stem: `某温度下某物质的溶解度为 ${sol}g，在 ${water}g 水中最多能溶解该物质多少克？`,
      answer: `${max}g`, answerNumeric: max, tolerance: 0.2,
      solution: `最多溶解质量 = 溶解度/100 × 水的质量 = ${sol}/100×${water}=${max}g。`,
      hints: ["溶解度是100g水中的溶解量。", "按比例换算到实际水的质量。", "用溶解度除以100再乘水质量。", `完整解析：${sol}/100×${water}=${max}g。`],
      variantGroup: "chem-solcalc",
    });
  });
  // 质量分数稀释计算
  const dil = [[100, 20, 100], [50, 10, 50], [200, 15, 100], [80, 25, 80]];
  dil.forEach(([m, w, addWater], i) => {
    const newW = round((m * w / 100) / (m + addWater) * 100, 1);
    out.push({
      key: `CQ-DIL-${i}`, nodeCode: "CH-M10-U02-K02", type: "NUMERIC", difficulty: "L3",
      stem: `有 ${m}g 溶质质量分数为 ${w}% 的溶液，加入 ${addWater}g 水后，所得溶液的溶质质量分数是多少？（保留一位小数）`,
      answer: `${newW}%`, answerNumeric: newW, tolerance: 0.2,
      solution: `溶质质量不变为 ${round(m*w/100,2)}g，溶液质量变为 ${m+addWater}g，质量分数=${newW}%。`,
      hints: ["加水稀释时溶质质量不变。", "先算出溶质质量。", "用溶质质量除以新的溶液质量。", `完整解析：稀释后质量分数为 ${newW}%。`],
      variantGroup: "chem-dilution",
    });
  });
  // 补充：化学式与方程式基础
  out.push({
    key: "CQ-EXTRA-0", nodeCode: "CH-M07-U02-K01", type: "FILL_BLANK", difficulty: "L1",
    stem: "配平化学方程式：___Al + ___O₂ 点燃 ___Al₂O₃，氧气前面的系数是：",
    answer: "3", solution: "4Al+3O₂点燃2Al₂O₃，氧气系数为3。",
    hints: ["根据质量守恒配平。", "先配平氧元素。", "系数取最简整数比。", "完整解析：4Al+3O₂点燃2Al₂O₃。"],
    variantGroup: "chem-balance",
  });
  out.push({
    key: "CQ-EXTRA-1", nodeCode: "CH-M06-U01-K03", type: "NUMERIC", difficulty: "L2",
    stem: "计算硫酸（H₂SO₄）的相对分子质量。（H-1 S-32 O-16）",
    answer: "98", answerNumeric: 98, tolerance: 0.1,
    solution: "H₂SO₄相对分子质量=1×2+32+16×4=98。",
    hints: ["把各原子相对原子质量相加。", "注意下标。", "2个H、1个S、4个O。", "完整解析：2+32+64=98。"],
    variantGroup: "chem-mr",
  });
  return out;
}

export function generateQuestions(): GenQuestion[] {
  return [
    ...physicsGravity(), ...physicsSpeed(), ...physicsDensity(), ...physicsPressure(),
    ...physicsOhm(), ...physicsPower(), ...physicsWork(), ...physicsHeat(), ...physicsBuoyancy(),
    ...physicsConcept(), ...physicsTrueFalse(), ...physicsExtraCalc(),
    ...chemistryMr(), ...chemistryMassFraction(), ...chemistryConcept(), ...chemistryEquation(),
    ...chemistryTrueFalse(), ...chemistryEquationCalc(), ...chemistryComposition(), ...chemistryMoreConcept(),
    ...chemistryCalcMore(),
  ];
}
