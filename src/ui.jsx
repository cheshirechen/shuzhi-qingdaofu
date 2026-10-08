import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { BASE_PATH } from './paths.mjs';
import { DemoRelay } from './realtime.js';

export function Icon({ name, className = '' }) {
  const paths = {
    scan: 'M4 8V4h4M16 4h4v4M4 16v4h4m8 0h4v-4M8 12h8M12 8v8',
    map: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zm5-2v14m6-12v14',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4',
    camera: 'M5 7h3l2-3h4l2 3h3v12H5V7zm7 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    route: 'M5 19c0-5 7-3 7-8s7-3 7-8M5 19l-2-3m2 3 3-2M18 3l-2 2m2-2 2 2',
    check: 'M5 12l4 4L19 6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8c1-4 4-6 7-6s6 2 7 6',
    cloud: 'M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8.5 4.8 4.8 0 0 0 7 18z',
    reset: 'M5 7v5h5M6 11a7 7 0 1 1 1 6',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2',
    shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zm-4 9 3 3 5-6',
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.scan}/></svg>;
}

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

export function useRelay(session) {
  const [room, setRoom] = useState({ session, stage: 'idle', eventSeq: 0, revision: 0, relay: { mode: 'local', connected: false } });
  const relayRef = useRef(null);
  useEffect(() => {
    const relay = new DemoRelay(session, setRoom);
    relayRef.current = relay;
    relay.start();
    return () => relay.stop();
  }, [session]);
  const update = useCallback((patch, role) => relayRef.current?.update(patch, role), []);
  return [room, update];
}

export function roleUrl(view, session) {
  const url = new URL(BASE_PATH, window.location.origin);
  url.searchParams.set('view', view);
  url.searchParams.set('session', session);
  return url.href;
}

export function QrCard({ label, hint, url, accent }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#102032', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc('')); }, [url]);
  return <div className="qr-card"><div className="qr-code" style={{ '--accent': accent }}>{src ? <img src={src} alt={`${label}二维码`}/> : <span>生成中</span>}</div><div><strong>{label}</strong><small>{hint}</small><a href={url} target="_blank" rel="noreferrer">在当前设备打开 ↗</a></div></div>;
}

export function MobileHeader({ title, subtitle }) {
  return <header className="mobile-header"><span className="mobile-logo"><Icon name="scan"/></span><div><h1>{title}</h1><p>{subtitle}</p></div></header>;
}
