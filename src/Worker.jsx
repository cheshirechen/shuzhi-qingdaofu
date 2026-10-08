import React, { useEffect, useRef, useState } from 'react';
import { EVENT, STAGES } from './demoData.js';
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
  const [armed, setArmed] = useState(false), [navOpen, setNavOpen] = useState(false);
  const audio = useRef(null), previousStage = useRef(room.stage);
  useEffect(() => {
    if (armed && room.stage === 'dispatched' && previousStage.current !== 'dispatched') { beep(audio.current); navigator.vibrate?.([180, 100, 180]); }
    previousStage.current = room.stage;
  }, [room.stage, armed]);
  const enter = async () => { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) { audio.current = audio.current || new AudioContext(); await audio.current.resume(); beep(audio.current); } setArmed(true); };
  const hasTask = ['dispatched','accepted','completed'].includes(room.stage);
  return <div className="mobile-shell worker-shell"><MobileHeader title="清道夫作业端" subtitle={`${EVENT.worker} · 在线`}/>
    {!armed ? <main className="worker-enter"><div className="worker-orbit"><span><Icon name="bell"/></span></div><h2>进入任务待命</h2><p>开启后，新工单到达时将声音和震动提醒。</p><button onClick={enter}>进入待命</button><small>房间码 {session}</small></main> : <main className="worker-main">
      {!hasTask ? <section className="waiting-card"><div className="waiting-radar"><span/><span/><span/><Icon name="scan"/></div><h2>正在等待新任务</h2><p>保持页面开启，指挥中心派单后将自动提醒。</p><div><i/>位置共享正常&nbsp;&nbsp;·&nbsp;&nbsp;当前空闲</div></section> : <section className={`task-card ${room.stage}`}>
        <div className="task-alert"><span>{room.stage === 'dispatched' ? '新任务' : room.stage === 'accepted' ? '任务处理中' : '任务已完成'}</span><b>{STAGES[room.stage].label}</b></div>
        <div className="task-body"><div className="task-brief"><span>{EVENT.risk}优先级</span><strong>{EVENT.distance}</strong></div><span className="task-id">{EVENT.id}</span><h2>{EVENT.title}</h2><p><Icon name="map"/>{EVENT.location}</p><div className="task-stats"><div><span>建议到达</span><strong>5 min</strong></div><div><span>作业工具</span><strong>夹钳 / 垃圾袋</strong></div><div><span>安全提示</span><strong>注意周边行人</strong></div></div></div>
        {navOpen && <div className="mini-navigation"><div className="nav-road"><span className="nav-start"/><i/><i/><span className="nav-end"/></div><div><strong>已开始路线引导</strong><small>{EVENT.route}</small></div></div>}
        <div className="task-actions">{room.stage === 'dispatched' && <><button className="accept" onClick={() => update({ stage: 'accepted', acceptedAt: Date.now() }, 'worker')}><Icon name="check"/>接单</button><button onClick={() => setNavOpen(value => !value)}><Icon name="route"/>导航</button></>}{room.stage === 'accepted' && <><button onClick={() => setNavOpen(value => !value)}><Icon name="route"/>{navOpen ? '收起路线' : '导航'}</button><button className="complete" onClick={() => update({ stage: 'completed', completedAt: Date.now() }, 'worker')}><Icon name="check"/>完成</button></>}{room.stage === 'completed' && <div className="task-done"><Icon name="check"/><span><strong>处置结果已上报</strong><small>指挥中心已同步更新</small></span></div>}</div>
      </section>}
    </main>}<footer className="mobile-footer"><span><i/>作业员在线</span><span>房间 {session}</span></footer></div>;
}
