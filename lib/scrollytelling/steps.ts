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
//
// Narrative: using the 2023 "Prada Rong Residence fire" rumor (b596cd8d) as
// the anchor event, with the Apr–Aug 2023 burst campaign as context.
export const STEPS: Step[] = [
  {
    id: "overview",
    presetId: "overview",
    eyebrow: "01 / 总览",
    title: "2023 年夏天的异常信号",
    body:
      "2023 年 4 月至 8 月，微博虚假信息量骤增。6 月单月假新闻 1,605 条，是真实信息的 6 倍。关键词集中：福建农业职业技术、Prada、郑州狗主悬赏。",
    side: "left",
    stage: "network",
    apply: preset("overview"),
  },
  {
    id: "fake-burst",
    presetId: "fake-burst",
    eyebrow: "02 / 突发",
    title: "一条谣言的出现",
    body:
      "2023 年 7 月 2 日，一张 Prada 荣宅起火的截图在微博发酵。配文称上海荣宅突发大火，事实是荣宅安然无恙。该谣言获近万次点赞、上千次转发。",
    side: "right",
    stage: "network",
    apply: preset("fake-burst"),
  },
  {
    id: "propagation-core",
    presetId: "propagation-core",
    eyebrow: "03 / 扩散",
    title: "沉默的转发链条",
    body:
      "Prada 火灾谣言的传播拓扑有 160 个节点、203 条关系边。几乎全是单向转发——没有质疑，没有辟谣评论。",
    side: "left",
    stage: "network",
    apply: preset("propagation-core"),
  },
  {
    id: "template-cluster",
    presetId: "template-cluster",
    eyebrow: "04 / 话术",
    title: "复制粘贴的账号群",
    body:
      "同一时期，热门视频模板被 4,876 个账号使用，其中疑似水军占比 28.5%。同一句话被不同账号同时推送——这是协调放水的典型指纹。",
    side: "right",
    stage: "network",
    apply: preset("template-cluster"),
  },
  {
    id: "ringleader-hunt",
    presetId: "ringleader-hunt",
    eyebrow: "05 / 放大者",
    title: "谁在推动扩散？",
    body:
      "按水军评分和虚假参与比排序，账号 da1793d8 排在首位——水军评分 0.97，虚假参与比 100%。它参与的 7 条微博全部是虚假信息。",
    side: "left",
    stage: "network",
    apply: preset("ringleader-hunt"),
  },
  {
    id: "bot-heavy",
    presetId: "bot-heavy",
    eyebrow: "06 / 网络",
    title: "代理信号的聚集",
    body:
      "大量高 botScore 账号围绕同一时段集中活动，是协调行动的证据。但弱监督标签只是代理信号——这是审计界面，不是判决。",
    side: "left",
    stage: "network",
    apply: preset("bot-heavy"),
  },
  {
    id: "evidence-focus",
    presetId: "evidence-focus",
    eyebrow: "07 / 细读",
    title: "回到原文",
    body:
      "上海静安区的 Prada 荣宅今晚突然发生火灾了！拥有百年历史的荣宅是清末面粉大王荣宗敬的宝邸……——转发近万次。当天 Prada 官方无声明，上海消防无出警记录。",
    side: "right",
    stage: "network",
    apply: preset("evidence-focus"),
  },
  {
    id: "limits",
    presetId: "limits",
    eyebrow: "08 / 边界",
    title: "拓扑不是裁决",
    body:
      "一条谣言经过话术包装、自动化放大、沉默转发，最终形成集体认知。审计系统的角色是呈现可追溯的证据链，而最终判断需要人来完成。",
    side: "left",
    stage: "network",
    apply: preset("limits"),
  },
];
