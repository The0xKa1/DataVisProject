export type StageKind = "network" | "timeline" | "space";

export interface StepHelpers {
  setStoryPreset: (presetId: string) => void;
}

export interface Step {
  id: string;
  presetId: string;
  eyebrow: string;
  title: string;
  body: string;
  side: "left" | "right";
  stage: StageKind;
  apply: (h: StepHelpers) => void;
}

function preset(id: string) {
  return (h: StepHelpers) => h.setStoryPreset(id);
}

// MIT-style story steps: each card only selects a deterministic network
// preset. The preset then drives viewport, highlights, timeline window, and
// evidence through the dashboard store.
export const STEPS: Step[] = [
  {
    id: "overview",
    presetId: "overview",
    eyebrow: "01 / 总览",
    title: "从同一张真实传播场开始。",
    body:
      "背景不是装饰图，而是由 MisBot 案例分片预计算出的节点、边和焦点区域。先拉远，把拓扑当作审计语境来读。",
    side: "left",
    stage: "network",
    apply: preset("overview"),
  },
  {
    id: "fake-burst",
    presetId: "fake-burst",
    eyebrow: "02 / 突发",
    title: "进入虚假信息高发窗口。",
    body:
      "镜头移动到虚假信息密集月份，共享筛选器同步到同一时间窗。这里回答“哪里爆了”，还不急着下判断。",
    side: "right",
    stage: "network",
    apply: preset("fake-burst"),
  },
  {
    id: "propagation-core",
    presetId: "propagation-core",
    eyebrow: "03 / 扩散",
    title: "看它怎样扩散。",
    body:
      "同一张图不重排，只改变尺度。转发、评论、级联边被保留下来，分析台会接住当前事件的完整传播图。",
    side: "left",
    stage: "network",
    apply: preset("propagation-core"),
  },
  {
    id: "template-cluster",
    presetId: "template-cluster",
    eyebrow: "04 / 话术",
    title: "重复话术变成空间证据。",
    body:
      "纯 NLP 能发现相似文本；这里把相似话术放回传播拓扑，查看同一句话术是否被同一批账号持续放大。",
    side: "right",
    stage: "network",
    apply: preset("template-cluster"),
  },
  {
    id: "ringleader-hunt",
    presetId: "ringleader-hunt",
    eyebrow: "05 / 头子",
    title: "把疑似组织者挑出来。",
    body:
      "按水军代理分数、虚假参与占比和一跳邻域寻找核心放大者。视觉冲击来自拓扑证据链，而不是一句“AI 生成”。",
    side: "left",
    stage: "network",
    apply: preset("ringleader-hunt"),
  },
  {
    id: "bot-heavy",
    presetId: "bot-heavy",
    eyebrow: "06 / 群体",
    title: "再看整片代理信号。",
    body:
      "弱水军标签只是代理证据。系统高亮高占比参与结构，同时保留“这是审计界面，不是裁决”的视觉边界。",
    side: "left",
    stage: "network",
    apply: preset("bot-heavy"),
  },
  {
    id: "evidence-focus",
    presetId: "evidence-focus",
    eyebrow: "07 / 细读",
    title: "落到一个局部邻域。",
    body:
      "镜头落到单条帖子及其直接邻居。证据面板接收同一个选中事件，让滚动步骤最终落在可读材料上。",
    side: "right",
    stage: "network",
    apply: preset("evidence-focus"),
  },
  {
    id: "limits",
    presetId: "limits",
    eyebrow: "08 / 边界",
    title: "在下结论前拉远。",
    body:
      "网络重新拉远。遗漏拓扑与代理标签仍是叙事的一部分，因为系统应为人工复核呈现信号，而不是自动指控。",
    side: "left",
    stage: "network",
    apply: preset("limits"),
  },
];
