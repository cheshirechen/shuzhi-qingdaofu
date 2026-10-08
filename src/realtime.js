import cloudbase from '@cloudbase/js-sdk';
import { freshRoom } from './demoData.js';

// 三个端口都主动检查离线外壳更新，避免发布新版后仍被旧缓存控制。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
    console.warn('Offline shell registration failed.', error);
  });
}

const cloudConfig = () => window.__QINGDAOFU_REALTIME__ || {};
const roomKey = session => `qingdaofu-room-${session}`;

function cloudReady(config) {
  return config.provider === 'cloudbase'
    && config.env
    && !String(config.env).startsWith('YOUR_');
}

function snapshotRoom(snapshot) {
  const docs = snapshot?.docs || snapshot?.data || [];
  if (Array.isArray(docs)) return docs[0] || null;
  return docs && typeof docs === 'object' ? docs : null;
}

export class DemoRelay {
  constructor(session, onState) {
    this.session = session;
    this.onState = onState;
    this.state = { ...freshRoom(session), revision: 0, updatedAt: 0 };
    this.mode = 'local';
    this.connected = false;
    this.channel = null;
    this.watcher = null;
    this.cloudDocument = null;
    this.stopped = false;
  }

  async start() {
    this.startLocal();
    const config = cloudConfig();
    if (!cloudReady(config)) {
      this.emit({ mode: 'local', connected: true, warning: '云端环境待配置' });
      return;
    }

    try {
      const options = {
        env: config.env,
        region: config.region || 'ap-shanghai',
        auth: { detectSessionInUrl: true },
      };
      if (config.accessKey && !String(config.accessKey).startsWith('YOUR_')) options.accessKey = config.accessKey;
      const app = cloudbase.init(options);
      const auth = app.auth;
      const login = await auth.signInAnonymously();
      if (login?.error) throw new Error(login.error.message || 'CloudBase 匿名登录失败');

      const db = app.database();
      this.cloudDocument = db.collection('demo_sessions').doc(this.session);
      const initial = await this.cloudDocument.get();
      const initialRoom = snapshotRoom(initial);
      if (initialRoom) this.accept(initialRoom);
      else await this.cloudDocument.set(this.state);

      this.mode = 'cloudbase';
      this.connected = true;
      this.watcher = this.cloudDocument.watch({
        onChange: snapshot => {
          const room = snapshotRoom(snapshot);
          if (room) this.accept(room);
          this.emit({ mode: 'cloudbase', connected: true });
        },
        onError: error => {
          console.warn('CloudBase realtime listener interrupted.', error);
          this.connected = false;
          this.emit({ mode: 'cloudbase', connected: false, warning: '云端同步暂时中断' });
        },
      });
      this.emit({ mode: 'cloudbase', connected: true });
    } catch (error) {
      console.warn('CloudBase relay unavailable; browser-local fallback remains active.', error);
      this.mode = 'local';
      this.connected = true;
      this.emit({ mode: 'local', connected: true, warning: '云端环境未连接' });
    }
  }

  startLocal() {
    const saved = localStorage.getItem(roomKey(this.session));
    if (saved) {
      try { this.accept(JSON.parse(saved)); } catch { /* ignore stale browser data */ }
    } else {
      localStorage.setItem(roomKey(this.session), JSON.stringify(this.state));
    }
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(roomKey(this.session));
      this.channel.onmessage = event => this.accept(event.data);
    }
    this.storageHandler = event => {
      if (event.key === roomKey(this.session) && event.newValue) {
        try { this.accept(JSON.parse(event.newValue)); } catch { /* ignore malformed data */ }
      }
    };
    window.addEventListener('storage', this.storageHandler);
    this.connected = true;
  }

  emit(meta = {}) {
    if (!this.stopped) this.onState({
      ...this.state,
      relay: { mode: this.mode, connected: this.connected, ...meta },
    });
  }

  accept(next) {
    if (!next || next.session !== this.session) return;
    if ((next.revision || 0) < (this.state.revision || 0)) return;
    this.state = { ...this.state, ...next };
    localStorage.setItem(roomKey(this.session), JSON.stringify(this.state));
    this.emit();
  }

  async update(patch, sourceRole) {
    const next = {
      ...this.state,
      ...patch,
      session: this.session,
      revision: Math.max(Date.now(), (this.state.revision || 0) + 1),
      updatedAt: Date.now(),
      sourceRole,
    };
    this.state = next;
    localStorage.setItem(roomKey(this.session), JSON.stringify(next));
    this.channel?.postMessage(next);
    this.emit();

    if (this.mode === 'cloudbase' && this.cloudDocument) {
      try {
        await this.cloudDocument.set(next);
      } catch (error) {
        console.warn('CloudBase state update failed.', error);
        this.connected = false;
        this.emit({ mode: 'cloudbase', connected: false, warning: '云端状态发送失败' });
      }
    }
    return next;
  }

  stop() {
    this.stopped = true;
    this.watcher?.close?.();
    this.channel?.close();
    window.removeEventListener('storage', this.storageHandler);
  }
}
