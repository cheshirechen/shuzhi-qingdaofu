export const DEMO_SESSION = 'ICAN2026';

export const STAGES = {
  idle: { label: '待命', tone: 'muted', color: '#71859a' },
  detected: { label: '待处理', tone: 'danger', color: '#ff4d68' },
  analyzing: { label: 'AI 研判中', tone: 'danger', color: '#ff4d68' },
  dispatched: { label: '待接单', tone: 'warning', color: '#ffb545' },
  accepted: { label: '处理中', tone: 'warning', color: '#ffb545' },
  completed: { label: '已完成', tone: 'success', color: '#38e08f' },
};

export const EVENT = {
  id: 'BJUT-20261011-001',
  title: '道路抛洒物',
  confidence: '96%',
  location: '北京工业大学国际文化交流中心北侧路段',
  shortLocation: '国际文化交流中心北侧',
  address: '北京市朝阳区平乐园100号',
  risk: '一般',
  distance: '1.2 km',
  worker: '环卫人员03',
  route: '北工大西门 → 平乐园路 → 事件点',
  image: 'samples/demo-cardboard.jpg',
};

export const AI_STEPS = [
  { key: 'perception', tag: '多模态感知', title: '事件特征解析', text: '识别为路面纸类与塑料抛洒物，未占用主车道。', value: '96%' },
  { key: 'context', tag: '时空推演', title: '环境与交通评估', text: '当前无降水，校园北侧路段通行正常，无需交通管制。', value: '轻度' },
  { key: 'resource', tag: '资源匹配', title: '作业单元检索', text: '环卫人员03当前空闲，与事件点路网距离最短。', value: '1.2 km' },
  { key: 'route', tag: '全局优化', title: '生成执行方案', text: '建议派发环卫人员03，绕开主入口人流，预计5分钟到达。', value: '方案 A' },
];

export function freshRoom(session = DEMO_SESSION) {
  return {
    session,
    stage: 'idle',
    revision: Date.now(),
    eventSeq: 0,
    eventTime: null,
    updatedAt: Date.now(),
    sourceRole: 'system',
  };
}

export function normalizeSession(value) {
  return (value || DEMO_SESSION).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || DEMO_SESSION;
}
