import React, { useEffect, useRef, useState } from 'react';
import { EVENT, STAGES, updateActiveEventStatuses } from './demoData.js';
import { Icon, MobileHeader, useRelay } from './ui.jsx';

function beep(context) {
  if (!context) return;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.frequency.setValueAtTime(740, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(1040, context.currentTime + .16);
  gain.gain.setValueAtTime(.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(.18, context.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .35);
  oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .36);
}

export default function Worker({ session }) {
  const [room, update] = useRelay(session);
  const [armed, setArmed] = useState(false), [navOpen, setNavOpen] = useState(false), [dismissedSeq, setDismissedSeq] = useState(null);
  const audio = useRef(null), previousStage = useRef(room.stage);
  useEffect(() => {
    if (armed && room.stage === 'dispatched' && previousStage.current !== 'dispatched') { beep(audio.current); navigator.vibrate?.([180, 100, 180]); }
    previousStage.current = room.stage;
  }, [room.stage, armed]);
  const enter = async () => { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) { audio.current = audio.current || new AudioContext(); await audio.current.resume(); beep(audio.current); } setArmed(true); };
  const hasTask = ['dispatched','accepted','completed'].includes(room.stage) && dismissedSeq !== room.eventSeq;
  const activeIds = new Set(room.activeEventIds || []);
  const activeEvents = (room.events || []).filter(event => activeIds.has(event.id));
  const taskEvents = activeEvents.length ? activeEvents : [EVENT];
  const setStage = stage => update({
    stage,
    [stage === 'accepted' ? 'acceptedAt' : 'completedAt']: Date.now(),
    events: updateActiveEventStatuses(room.events, room.activeEventIds, stage),
  }, 'worker');
  const returnToStandby = () => { setNavOpen(false); setDismissedSeq(room.eventSeq); };
  return <div className="mobile-shell worker-shell"><MobileHeader title="清道夫作业端" subtitle={`${EVENT.worker} · 在线`}/>
    {!armed ? <main className="worker-enter"><div className="worker-orbit"><span><Icon name="bell"/></span></div><h2>进入任务待命</h2><p>开启后，新工单到达时将声音和震动提醒。</p><button onClick={enter}>进入待命</button><small>房间码 {session}</small></main> : <main className="worker-main">
      {!hasTask ? <section className="waiting-card"><div className="waiting-radar"><span/><span/><span/><Icon name="scan"/></div><h2>正在等待新任务</h2><p>保持页面开启，指挥中心派单后将自动提醒。</p><div><i/>位置共享正常&nbsp;&nbsp;·&nbsp;&nbsp;当前空闲</div></section> : <section className={`task-card ${room.stage}`}>
        <div className="task-alert"><span>{room.stage === 'dispatched' ? '新任务' : room.stage === 'accepted' ? '任务处理中' : '任务已完成'}</span><b>{STAGES[room.stage].label}</b></div>
        <div className="task-body"><div className="task-brief"><span>{EVENT.risk}优先级 · {taskEvents.length}项事件</span><strong>{EVENT.distance}</strong></div><h2>{taskEvents.length > 1 ? `联合处置任务（${taskEvents.length}项）` : taskEvents[0].title}</h2><p><Icon name="map"/>{EVENT.location}</p>
          <div className="task-event-list">{taskEvents.map(event => <article key={event.id}><div><span className="task-id">{event.id}</span><b>{event.confidence}</b></div><h3>{event.title}</h3><p><strong>作业工具</strong>{event.tools}</p><p><strong>处置要求</strong>{event.action}</p></article>)}</div>
          <div className="task-stats"><div><span>建议到达</span><strong>{EVENT.arrival}</strong></div><div><span>执行人员</span><strong>{EVENT.worker}</strong></div><div><span>风险等级</span><strong>{EVENT.risk}</strong></div></div></div>
        {navOpen && <div className="mini-navigation"><div className="nav-road"><span className="nav-start"/><i/><i/><span className="nav-end"/></div><div><strong>已开始路线引导</strong><small>{EVENT.route}</small></div></div>}
        <div className="task-actions">
          {room.stage === 'dispatched' && <><button className="accept" onClick={() => setStage('accepted')}><Icon name="check"/>接单</button><button onClick={() => setNavOpen(value => !value)}><Icon name="route"/>导航</button></>}
          {room.stage === 'accepted' && <><button onClick={() => setNavOpen(value => !value)}><Icon name="route"/>{navOpen ? '收起路线' : '导航'}</button><button className="complete" onClick={() => setStage('completed')}><Icon name="check"/>完成</button></>}
          {room.stage === 'completed' && <><div className="task-done"><Icon name="check"/><span><strong>{taskEvents.length}项处置结果已上报</strong><small>指挥中心已同步更新，可继续接收下一轮任务</small></span></div><button className="return-standby" style={{gridColumn:'1 / -1',background:'#153341',borderColor:'#3b7184',color:'#c9f5ff'}} onClick={returnToStandby}><Icon name="bell"/>返回待命</button></>}
        </div>
      </section>}
    </main>}<footer className="mobile-footer"><span><i/>作业员在线</span><span>房间 {session}</span></footer></div>;
}
