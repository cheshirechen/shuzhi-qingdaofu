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
  const room = Array.isArray(docs) ? docs[0] : docs;
  if (!room || typeof room !== 'object') return null;
  const { _id, _openid, ...state } = room;
  return state;
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
    this.cloudConnectPromise = null;
    this.pendingCloudState = null;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  async start() {
    this.startLocal();
    this.resumeHandler = () => {
      if (!document.hidden && !this.stopped) this.connectCloud();
    };
    this.onlineHandler = () => this.connectCloud();
    document.addEventListener('visibilitychange', this.resumeHandler);
    window.addEventListener('online', this.onlineHandler);
    if (!cloudReady(cloudConfig())) {
      this.emit({ mode: 'local', connected: true, warning: '云端环境待配置' });
      return;
    }
    await this.connectCloud();
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectCloud();
    }, 1800);
  }

  async connectCloud() {
    if (this.stopped || !cloudReady(cloudConfig())) return;
    if (this.cloudConnectPromise) return this.cloudConnectPromise;
    this.cloudConnectPromise = this.openCloudConnection().finally(() => {
      this.cloudConnectPromise = null;
    });
    return this.cloudConnectPromise;
  }

  async openCloudConnection() {
    try {
      const config = cloudConfig();
      const options = {
        env: config.env,
        region: config.region || 'ap-shanghai',
        auth: { detectSessionInUrl: true },
      };
      if (config.accessKey && !String(config.accessKey).startsWith('YOUR_')) options.accessKey = config.accessKey;
      if (!this.cloudDocument) {
        const app = cloudbase.init(options);
        const auth = app.auth;
        const login = await auth.signInAnonymously();
        if (login?.error) throw new Error(login.error.message || 'CloudBase 匿名登录失败');
        this.cloudDocument = app.database().collection('demo_sessions').doc(this.session);
      }
      let initialRoom = null;
      try {
        const initial = await this.cloudDocument.get();
        initialRoom = snapshotRoom(initial);
      } catch (error) {
        if (error?.code !== 'DOCUMENT_NOT_FOUND') throw error;
      }
      if (this.pendingCloudState) {
        const pending = this.pendingCloudState;
        await this.cloudDocument.set(pending);
        this.pendingCloudState = null;
        this.accept(pending);
      } else if (initialRoom) {
        this.accept(initialRoom);
      } else {
        await this.cloudDocument.set(this.state);
      }

      this.mode = 'cloudbase';
      this.connected = true;
      this.watcher?.close?.();
      this.watcher = this.cloudDocument.watch({
        onChange: snapshot => {
          const room = snapshotRoom(snapshot);
          if (room) this.accept(room);
          this.emit({ mode: 'cloudbase', connected: true });
        },
        onError: error => {
          console.warn('CloudBase realtime listener interrupted.', error);
          this.watcher = null;
          this.connected = false;
          this.emit({ mode: 'cloudbase', connected: false, warning: '云端同步暂时中断' });
          this.scheduleReconnect();
        },
      });
      this.emit({ mode: 'cloudbase', connected: true });
    } catch (error) {
      console.warn('CloudBase relay unavailable; browser-local fallback remains active.', error);
      this.mode = 'local';
      this.connected = true;
      this.emit({ mode: 'local', connected: true, warning: '云端环境未连接' });
      this.scheduleReconnect();
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
    if (this.stopped) return;
    const relay = { mode: this.mode, connected: this.connected, ...meta };
    window.__QINGDAOFU_RELAY__ = relay;
    this.onState({ ...this.state, relay });
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
        this.pendingCloudState = next;
        this.connected = false;
        this.emit({ mode: 'cloudbase', connected: false, warning: '云端状态发送失败' });
        this.scheduleReconnect();
      }
    } else if (cloudReady(cloudConfig())) {
      // 手机刚打开或网络刚切换时先保留本次用户动作，云端连上后立即补发，避免事件丢失。
      this.pendingCloudState = next;
      this.connectCloud();
    }
    return next;
  }

  stop() {
    this.stopped = true;
    this.watcher?.close?.();
    this.channel?.close();
    clearTimeout(this.reconnectTimer);
    window.removeEventListener('storage', this.storageHandler);
    window.removeEventListener('online', this.onlineHandler);
    document.removeEventListener('visibilitychange', this.resumeHandler);
  }
}
