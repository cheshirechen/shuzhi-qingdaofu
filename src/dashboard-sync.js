import './realtime-config.js';
import { DemoRelay } from './realtime.js';
import { DEMO_SESSION, freshRoom, normalizeSession } from './demoData.js';

const session = normalizeSession(new URLSearchParams(window.location.search).get('session') || DEMO_SESSION);
let currentRoom = freshRoom(session);
let scheduledSeq = 0;
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function later(delay, callback) {
  const timer = setTimeout(callback, delay);
  timers.push(timer);
}

const relay = new DemoRelay(session, room => {
  currentRoom = room;
  window.qingdaofuSetConnection?.(room.relay?.mode, room.relay?.connected);
  window.qingdaofuApplyState?.(room);

  if (room.stage === 'idle') {
    clearTimers();
    scheduledSeq = 0;
    return;
  }

  if (room.stage === 'detected' && scheduledSeq !== room.eventSeq) {
    clearTimers();
    scheduledSeq = room.eventSeq;
    later(700, () => {
      if (currentRoom.stage === 'detected' && currentRoom.eventSeq === room.eventSeq) {
        relay.update({ stage: 'analyzing', analyzingAt: Date.now() }, 'dashboard');
      }
    });
    later(9400, () => {
      if (currentRoom.stage === 'analyzing' && currentRoom.eventSeq === room.eventSeq) {
        relay.update({ stage: 'dispatched', dispatchedAt: Date.now() }, 'dashboard');
      }
    });
  }
});

relay.start();

async function command(name) {
  if (name === 'detected') {
    clearTimers();
    scheduledSeq = 0;
    await relay.update({
      stage: 'detected',
      eventSeq: (currentRoom.eventSeq || 0) + 1,
      eventTime: Date.now(),
      acceptedAt: null,
      completedAt: null,
    }, 'dashboard');
  }
  if (name === 'dispatched') await relay.update({ stage: 'dispatched', dispatchedAt: Date.now() }, 'dashboard');
  if (name === 'accepted') await relay.update({ stage: 'accepted', acceptedAt: Date.now() }, 'dashboard');
  if (name === 'completed') await relay.update({ stage: 'completed', completedAt: Date.now() }, 'dashboard');
  if (name === 'reset') {
    clearTimers();
    scheduledSeq = 0;
    await relay.update({ ...freshRoom(session), eventSeq: currentRoom.eventSeq || 0 }, 'dashboard');
  }
}

window.addEventListener('qingdaofu-command', event => command(event.detail));
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'd') command('detected');
  if (key === 'a') command('accepted');
  if (key === 'c') command('completed');
  if (key === 'r') command('reset');
});
window.addEventListener('pagehide', () => {
  clearTimers();
  relay.stop();
});
