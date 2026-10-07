import React from 'react';
import { createRoot } from 'react-dom/client';
import './realtime-config.js';
import Dashboard from './Dashboard.jsx';
import Detector from './Detector.jsx';
import Worker from './Worker.jsx';
import { DEMO_SESSION, normalizeSession } from './demoData.js';
import { Icon, roleUrl } from './ui.jsx';
import './style.css';

function Home({ session }) {
  const roles = [
    ['dashboard','指挥中心','电脑大屏','北斗时空态势、AI研判与闭环进度','map'],
    ['detector','边缘感知端','识别手机','相机实时识别垃圾并发送事件信号','camera'],
    ['worker','现场执行端','清洁工手机','接收工单、导航、接单与完成上报','user'],
  ];
  return <div className="role-home"><div className="home-brand"><span><Icon name="scan"/></span><h1>数智清道夫</h1><p>北斗 × AI 空地协同智管中枢</p></div><div className="role-grid">{roles.map(([view,title,tag,desc,icon]) => <a key={view} href={roleUrl(view,session)}><span><Icon name={icon}/></span><small>{tag}</small><h2>{title}</h2><p>{desc}</p><b>进入端口 <Icon name="arrow"/></b></a>)}</div><div className="home-session">当前演示房间 <strong>{session}</strong> · 三端需使用同一房间码</div></div>;
}

function App() {
  const query = new URLSearchParams(window.location.search), view = query.get('view') || 'home', session = normalizeSession(query.get('session') || DEMO_SESSION);
  if (view === 'dashboard') return <Dashboard session={session}/>;
  if (view === 'detector') return <Detector session={session}/>;
  if (view === 'worker') return <Worker session={session}/>;
  return <Home session={session}/>;
}

const root = window.__QINGDAOFU_REACT_ROOT__ || createRoot(document.getElementById('root'));
window.__QINGDAOFU_REACT_ROOT__ = root;
root.render(<App/>);
