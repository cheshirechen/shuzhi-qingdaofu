import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AI_STEPS, EVENT, STAGES } from './demoData.js';
import { assetUrl } from './paths.mjs';
import { ConnectionPill, Icon, QrCard, roleUrl, useClock, useRelay } from './ui.jsx';

function CampusMap({ stage }) {
  const active = stage !== 'idle', complete = stage === 'completed', processing = ['dispatched', 'accepted'].includes(stage);
  return <div className="campus-map" aria-label="北京工业大学演示地图">
    <svg viewBox="0 0 900 560" role="img" aria-label="北京工业大学国际文化交流中心周边道路图">
      <defs><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#80cfff" strokeOpacity=".06"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="routeLine"><stop stopColor="#4ee6ff"/><stop offset="1" stopColor={complete ? '#38e08f' : '#ffb545'}/></linearGradient></defs>
      <rect width="900" height="560" fill="#091625"/><rect width="900" height="560" fill="url(#grid)"/>
      <g className="buildings"><path d="M90 78h178v106H90zM640 62h168v88H640zM620 365h195v112H620zM86 370h180v102H86z"/><path d="M330 92h225v78H330zM335 380h175v98H335z"/></g>
      <g className="roads"><path d="M0 282h900"/><path d="M300 0v560"/><path d="M585 0v560"/><path d="M0 318h900"/></g><g className="road-dashes"><path d="M0 300h900"/><path d="M318 0v560"/><path d="M567 0v560"/></g>
      <g className="map-labels"><text x="112" y="128">北京工业大学</text><text x="662" y="110">国际文化交流中心</text><text x="356" y="137">科学楼群</text><text x="655" y="430">平乐园100号</text><text x="118" y="425">环卫作业点</text><text className="road-name" x="376" y="344">校 园 北 路</text></g>
      {(processing || complete) && <path className="dispatch-route" d="M185 344 C255 342 290 316 370 300 S525 300 668 300"/>}
      <g className="worker-pin" opacity={processing || complete ? 1 : .25} transform="translate(184 344)"><circle r="12"/><g transform="translate(-7 -8)" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="4" r="3"/><path d="M1 14c1-4 4-6 6-6s5 2 6 6"/></g></g>
      {active && <g className={`event-pin ${complete ? 'complete' : processing ? 'processing' : 'pending'}`} transform="translate(680 300)"><circle className="ring r1" r="28"/><circle className="ring r2" r="18"/><circle className="core" r="9"/><path d="M0-26v-16"/><rect x="-51" y="-70" width="102" height="28" rx="5"/><text x="0" y="-51" textAnchor="middle">事件点</text></g>}
      <g className="north" transform="translate(842 72)"><path d="M0 28 10 0l10 28-10-5z"/><text x="10" y="45" textAnchor="middle">N</text></g><g className="scale" transform="translate(45 515)"><path d="M0 0h100M0-5v10M100-5v10"/><text x="50" y="22" textAnchor="middle">100 m</text></g>
    </svg>
    <div className="map-chips"><span>北斗定位已锁定</span><span>精度 1.6 m</span><span>39.8768°N&nbsp;&nbsp;116.4781°E</span></div>
  </div>;
}

function EventCard({ room }) {
  if (room.stage === 'idle') return <div className="empty-event"><span className="radar-mark"><Icon name="scan"/></span><strong>实时感知中</strong><small>等待手机端检测信号</small></div>;
  const tone = STAGES[room.stage], time = new Date(room.eventTime || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
  return <article className={`event-card ${tone.tone}`}><div className="event-photo"><img src={assetUrl(EVENT.image)} alt="道路抛洒物现场抓拍"/><span>现场抓拍</span></div><div className="event-info"><div className="event-card-head"><span className="event-id">{EVENT.id}</span><b style={{ color: tone.color }}><i/>{tone.label}</b></div><h3>{EVENT.title}</h3><dl><div><dt>置信度</dt><dd>{EVENT.confidence}</dd></div><div><dt>风险等级</dt><dd>{EVENT.risk}</dd></div><div className="wide"><dt>位置</dt><dd>{EVENT.location}</dd></div><div><dt>时间</dt><dd>{time}</dd></div><div><dt>来源</dt><dd>手机边缘节点</dd></div></dl></div></article>;
}

function AiPanel({ room, step }) {
  const started = room.stage !== 'idle' && room.stage !== 'detected', done = ['dispatched', 'accepted', 'completed'].includes(room.stage);
  return <section className="panel ai-panel"><div className="panel-title"><span><i className="title-icon">AI</i>DeepSeek 调度决策</span><b className={started ? 'active' : ''}>{started ? '模型推演中' : '等待事件'}</b></div><div className="ai-body">
    {room.stage === 'idle' && <div className="ai-standby"><div className="orb"><span/><span/><span/></div><strong>决策引擎已就绪</strong><small>环境、交通与作业资源将在事件发生后联合推演</small></div>}
    {room.stage === 'detected' && <div className="ai-boot"><span className="terminal-cursor"/>正在接入事件与北斗时空数据……</div>}
    {started && <div className="reasoning-list">{AI_STEPS.map((item, index) => { const visible = done || index <= step; return <div className={`reasoning-item ${visible ? 'visible' : ''} ${index === step && !done ? 'running' : ''}`} key={item.key}><div className="reasoning-index">{(visible && index < step) || done ? '✓' : index + 1}</div><div><span>{item.tag}</span><strong>{item.title}</strong><p>{visible ? item.text : '等待上一步输出……'}</p></div><b>{visible ? item.value : '—'}</b></div>; })}</div>}
  </div>{done && <div className="dispatch-result"><span>已生成最优调度方案</span><strong>已自动派单</strong></div>}</section>;
}

export default function Dashboard({ session }) {
  const [room, update] = useRelay(session), now = useClock();
  const [analysisStep, setAnalysisStep] = useState(-1), [showConnect, setShowConnect] = useState(false);
  const detectorUrl = useMemo(() => roleUrl('detector', session), [session]), workerUrl = useMemo(() => roleUrl('worker', session), [session]);
  const active = room.stage !== 'idle', tone = STAGES[room.stage] || STAGES.idle;
  const trigger = useCallback(() => update({ stage: 'detected', eventSeq: (room.eventSeq || 0) + 1, eventTime: Date.now() }, 'dashboard'), [room.eventSeq, update]);
  const reset = useCallback(() => update({ stage: 'idle', eventTime: null }, 'dashboard'), [update]);

  useEffect(() => { if (room.stage !== 'detected') return; const id = setTimeout(() => update({ stage: 'analyzing' }, 'dashboard'), 850); return () => clearTimeout(id); }, [room.stage, room.eventSeq, update]);
  useEffect(() => { if (room.stage !== 'analyzing') { if (room.stage === 'idle') setAnalysisStep(-1); return; } setAnalysisStep(0); const ticks = [1,2,3].map((value,index) => setTimeout(() => setAnalysisStep(value), 1450 * (index + 1))); const dispatch = setTimeout(() => update({ stage: 'dispatched' }, 'dashboard'), 6500); return () => { ticks.forEach(clearTimeout); clearTimeout(dispatch); }; }, [room.stage, room.eventSeq, update]);
  useEffect(() => { const onKey = event => { if (event.key.toLowerCase() === 'd' && room.stage === 'idle') trigger(); if (event.key.toLowerCase() === 'r') reset(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [room.stage, trigger, reset]);

  const oldEvents = [['15:31:08','非机动车道散落物','北工大东门'],['15:18:44','枝叶堆积','平乐园小区南门'],['14:57:21','路面污渍','西大望路辅路']];
  return <div className="dashboard-shell"><header className="dashboard-header"><div className="brand" onDoubleClick={() => room.stage === 'idle' && trigger()}><span className="brand-symbol"><Icon name="scan"/></span><div><h1>数智清道夫</h1><p>基于北斗与 AI 大模型的空地协同智管中枢</p></div></div><div className="system-strip"><ConnectionPill room={room}/><button className="header-button" onClick={() => setShowConnect(true)}><Icon name="phone"/>设备接入</button><div className="clock"><strong>{now.toLocaleTimeString('zh-CN', { hour12: false })}</strong><span>{now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span></div></div></header>
    <main className="dashboard-grid"><aside className="left-rail"><section className="panel overview-panel"><div className="panel-title"><span>实时运行态势</span><b>全域感知</b></div><div className="metric-grid"><div><span>今日事件</span><strong>{127 + (room.eventSeq || 0)}</strong><small>较昨日 <i>+8.2%</i></small></div><div><span>已闭环</span><strong>{room.stage === 'completed' ? 119 : 118}</strong><small>闭环率 <i>93.7%</i></small></div><div><span>设备在线</span><strong>24</strong><small>运行正常</small></div><div><span>平均响应</span><strong>4.8<em> min</em></strong><small>相比人工 <i>-71%</i></small></div></div></section>
      <section className="panel event-pool"><div className="panel-title"><span>实时事件流</span><b className={active ? 'alert' : ''}>{active ? '1 条新事件' : '系统待命'}</b></div><div className="event-feed">{active && <div className={`feed-item ${tone.tone}`}><span className="feed-time">{new Date(room.eventTime || Date.now()).toLocaleTimeString('zh-CN', { hour12: false })}</span><div><strong>{EVENT.title}</strong><small>{EVENT.shortLocation}</small></div><b>{tone.label}</b></div>}{oldEvents.map(item => <div className="feed-item dim" key={item[0]}><span className="feed-time">{item[0]}</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div><b>已完成</b></div>)}</div></section>
      <section className="panel control-panel"><div className="panel-title"><span>演示控制</span><b>房间 {session}</b></div><div className="control-actions"><button className="danger-action" onClick={trigger} disabled={room.stage !== 'idle'}><Icon name="bell"/>触发事件</button><button onClick={reset}><Icon name="reset"/>重置流程</button></div><p>识别手机触发后会自动推进；键盘 D / R 可作为现场备用。</p></section></aside>
      <section className="center-stage"><div className="map-header"><div><span>实时时空态势</span><strong>北京工业大学 · 平乐园校区</strong></div><div className="map-legend"><span><i className="red"/>待处理</span><span><i className="yellow"/>处理中</span><span><i className="green"/>已完成</span></div></div><CampusMap stage={room.stage}/><EventCard room={room}/></section>
      <aside className="right-rail"><AiPanel room={room} step={analysisStep}/><section className="panel dispatch-panel"><div className="panel-title"><span>智能派单</span><b className={room.stage === 'completed' ? 'done' : ''}>{active ? tone.label : '暂无任务'}</b></div>{['dispatched','accepted','completed'].includes(room.stage) ? <div className="worker-card"><div className="worker-avatar"><Icon name="user"/></div><div><strong>{EVENT.worker}</strong><span>综合评分 4.9 · 当前空闲</span></div><b>{EVENT.distance}</b></div> : <div className="worker-placeholder"><Icon name="route"/><span>等待 AI 生成作业方案</span></div>}<div className="dispatch-timeline">{[['detected','事件建档'],['analyzing','AI研判'],['dispatched','工单派发'],['accepted','现场处置'],['completed','闭环归档']].map(([key,label], index) => { const order = ['idle','detected','analyzing','dispatched','accepted','completed'], reached = order.indexOf(room.stage) >= order.indexOf(key); return <div className={reached ? 'reached' : ''} key={key}><i>{reached ? '✓' : index + 1}</i><span>{label}</span></div>; })}</div>{room.stage === 'completed' && <div className="closed-loop"><Icon name="check"/><div><strong>事件已闭环</strong><span>历史事件 +1 · 处置记录已归档</span></div></div>}</section></aside></main>
    <footer className="dashboard-footer"><span><i/>北斗时空引擎正常</span><span><i/>边缘感知节点 24 / 24</span><span><i/>决策服务正常</span><b>iCAN 2026 · 北京赛区</b></footer>
    {showConnect && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setShowConnect(false)}><div className="connect-modal"><button className="modal-close" onClick={() => setShowConnect(false)}>×</button><div className="modal-heading"><span><Icon name="phone"/></span><div><h2>接入演示设备</h2><p>两台手机使用同一房间码即可联动</p></div></div><div className="qr-grid"><QrCard label="识别手机" hint="扫码进入感知端" url={detectorUrl} accent="#49dfff"/><QrCard label="清洁工手机" hint="扫码进入执行端" url={workerUrl} accent="#45e498"/></div><div className="connection-note"><Icon name="shield"/><span>{room.relay?.mode === 'cloud' ? '已连接云端信令通道，三端可跨设备实时同步。' : '当前为本机联调。填写 Firebase 配置后，三端即可跨设备联动。'}</span></div></div></div>}
  </div>;
}
