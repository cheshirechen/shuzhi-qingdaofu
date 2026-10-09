export const DEMO_SESSION = 'ICAN2026';

export const STAGES = {
  idle: { label: '待命', tone: 'muted', color: '#71859a' },
  detected: { label: '待处理', tone: 'danger', color: '#ff4d68' },
  analyzing: { label: 'AI 研判中', tone: 'danger', color: '#ff4d68' },
  dispatched: { label: '待接单', tone: 'warning', color: '#ffb545' },
  accepted: { label: '处理中', tone: 'warning', color: '#ffb545' },
  completed: { label: '已完成', tone: 'success', color: '#38e08f' },
};

export const COMMON_EVENT = {
  date: '2026年10月11日',
  location: '北京工业大学平乐园校区·国际文化交流中心',
  shortLocation: '国际文化交流中心',
  address: '北京市朝阳区平乐园100号',
  latitude: 39.8756,
  longitude: 116.4812,
  risk: '一般',
  distance: '1.1 m',
  arrival: '现场即可处理',
  worker: '环卫人员03',
  route: '现场作业端 → 国际文化交流中心事件点',
};

export const EVENT_TYPES = {
  plastic: {
    key: 'plastic', label: '塑料', code: 'PL', title: '塑料包装物散落', fallbackConfidence: 96,
    tools: '防护手套 / 夹钳 / 可回收物垃圾袋', safety: '防止轻质包装物二次飘移',
    action: '夹取散落塑料并分类装袋，防止轻质包装物二次飘移',
    analysis: '识别为塑料包装物散落，属于轻质可回收物，未形成通行阻断。',
  },
  cardboard: {
    key: 'cardboard', label: '纸板', code: 'CB', title: '废弃纸板散落', fallbackConfidence: 94,
    tools: '防护手套 / 折叠夹 / 捆扎带', safety: '注意纸板边缘及现场人员通行',
    action: '折叠压平后捆扎回收，保持现场通道畅通',
    analysis: '识别为废弃纸板散落，占用面积较小，未阻断现场通道。',
  },
  metal: {
    key: 'metal', label: '金属', code: 'MT', title: '金属罐体遗撒', fallbackConfidence: 92,
    tools: '防割手套 / 夹钳 / 硬质收集箱', safety: '检查锐边，避免徒手接触',
    action: '确认无尖锐破损后夹取，置入硬质容器分类回收',
    analysis: '识别为金属罐体遗撒，存在滚动和锐边接触风险。',
  },
};

export const MODEL_LABEL_TO_EVENT = { 1: 'cardboard', 3: 'metal', 5: 'plastic' };

export function normalizeDetectedTypes(types = []) {
  const normalized = [];
  for (const item of types) {
    const key = typeof item === 'string' ? item : item?.key;
    if (!EVENT_TYPES[key] || normalized.some(entry => entry.key === key)) continue;
    const score = typeof item === 'object' && Number.isFinite(Number(item.score))
      ? Math.max(0, Math.min(1, Number(item.score)))
      : EVENT_TYPES[key].fallbackConfidence / 100;
    normalized.push({ key, score });
  }
  return normalized.length ? normalized : [{ key: 'plastic', score: EVENT_TYPES.plastic.fallbackConfidence / 100 }];
}

export function createBatchEvents(types, eventTime = Date.now(), startNumber = 1) {
  return normalizeDetectedTypes(types).map((detected, index) => {
    const preset = EVENT_TYPES[detected.key];
    const number = startNumber + index;
    return {
      ...COMMON_EVENT, ...preset,
      id: `BJUT-20261011-${preset.code}-${String(number).padStart(3, '0')}`,
      confidence: `${Math.round(detected.score * 100)}%`, score: detected.score,
      eventTime, status: 'detected', batchIndex: index,
    };
  });
}

export function updateActiveEventStatuses(events = [], activeEventIds = [], stage) {
  const active = new Set(activeEventIds || []);
  return events.map(event => active.has(event.id) ? { ...event, status: stage } : event);
}

// 兼容旧组件；新流程均从 EVENT_TYPES 创建事件批次。
export const EVENT = { ...COMMON_EVENT, ...EVENT_TYPES.plastic, id: 'BJUT-20261011-PL-001', confidence: '96%' };

export const AI_STEPS = [
  { key: 'perception', tag: '多模态感知', title: '事件特征解析', text: '已读取本轮垃圾类型与置信度。', value: '已校核' },
  { key: 'context', tag: '时空推演', title: '环境与交通评估', text: '多云转阴、无降水，现场通行正常。', value: '一般' },
  { key: 'resource', tag: '资源匹配', title: '作业单元检索', text: '环卫人员03与事件点位于同一现场。', value: '1.1 m' },
  { key: 'route', tag: '全局优化', title: '生成执行方案', text: '生成联合处置工单，现场即可处理。', value: '方案 A' },
];

export function freshRoom(session = DEMO_SESSION) {
  return {
    session, stage: 'idle', revision: Date.now(), eventSeq: 0, recordSeq: 0,
    eventTime: null, events: [], activeEventIds: [], updatedAt: Date.now(), sourceRole: 'system',
  };
}

export function normalizeSession(value) {
  return (value || DEMO_SESSION).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || DEMO_SESSION;
}
