import { freshRoom } from './demoData.js';

const cloudConfig = () => window.__QINGDAOFU_REALTIME__ || {};
const roomKey = session => `qingdaofu-room-${session}`;

export class DemoRelay {
  constructor(session, onState) {
    this.session = session;
    this.onState = onState;
    this.state = { ...freshRoom(session), revision: 0, updatedAt: 0 };
    this.mode = 'local';
    this.connected = false;
    this.channel = null;
    this.pollTimer = null;
    this.auth = null;
    this.stopped = false;
  }

  async start() {
    this.startLocal();
    const config = cloudConfig();
    if (!config.apiKey || !config.databaseURL || String(config.apiKey).startsWith('YOUR_')) {
      this.emit({ connection: 'local', connected: true });
      return;
    }
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      });
      if (!response.ok) throw new Error(`auth-${response.status}`);
      this.auth = await response.json();
      this.mode = 'cloud';
      this.connected = true;
      await this.pullCloud();
      this.pollTimer = setInterval(() => this.pullCloud().catch(error => console.warn('Relay polling paused for this cycle.', error)), 700);
      this.emit({ connection: 'cloud', connected: true });
    } catch (error) {
      console.warn('Cloud relay unavailable; local rehearsal remains active.', error);
      this.mode = 'local';
      this.emit({ connection: 'local', connected: true, warning: '云同步未连接，当前为本机联调' });
    }
  }

  startLocal() {
    const saved = localStorage.getItem(roomKey(this.session));
    if (saved) {
      try { this.accept(JSON.parse(saved)); } catch { /* ignore stale local data */ }
    } else {
      localStorage.setItem(roomKey(this.session), JSON.stringify(this.state));
    }
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(roomKey(this.session));
      this.channel.onmessage = event => this.accept(event.data);
    }
    this.storageHandler = event => {
      if (event.key === roomKey(this.session) && event.newValue) {
        try { this.accept(JSON.parse(event.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', this.storageHandler);
    this.connected = true;
  }

  emit(meta = {}) {
    if (!this.stopped) this.onState({ ...this.state, relay: { mode: this.mode, connected: this.connected, ...meta } });
  }

  accept(next) {
    if (!next || next.session !== this.session) return;
    if ((next.revision || 0) < (this.state.revision || 0)) return;
    this.state = { ...this.state, ...next };
    this.emit();
  }

  async pullCloud() {
    if (this.stopped || !this.auth) return;
    const response = await fetch(this.cloudUrl(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`database-${response.status}`);
    const next = await response.json();
    if (next) this.accept(next);
  }

  cloudUrl() {
    const base = cloudConfig().databaseURL.replace(/\/$/, '');
    return `${base}/demoRooms/${encodeURIComponent(this.session)}.json?auth=${encodeURIComponent(this.auth.idToken)}`;
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
    if (this.mode === 'cloud' && this.auth) {
      try {
        const response = await fetch(this.cloudUrl(), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error(`database-${response.status}`);
      } catch (error) {
        console.warn('Relay update failed.', error);
        this.emit({ connection: 'cloud', connected: false, warning: '云同步短暂中断' });
      }
    }
    return next;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    this.channel?.close();
    window.removeEventListener('storage', this.storageHandler);
  }
}
