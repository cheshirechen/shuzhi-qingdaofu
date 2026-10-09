import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchEvents, freshRoom, updateActiveEventStatuses } from '../src/demoData.js';

test('creates a synchronized multi-type batch with unique ids', () => {
  const events = createBatchEvents([
    { key: 'plastic', score: .961 },
    { key: 'cardboard', score: .943 },
    { key: 'metal', score: .918 },
    { key: 'plastic', score: .8 },
  ], 1234, 7);
  assert.deepEqual(events.map(event => event.id), [
    'BJUT-20261011-PL-007',
    'BJUT-20261011-CB-008',
    'BJUT-20261011-MT-009',
  ]);
  assert.deepEqual(events.map(event => event.confidence), ['96%', '94%', '92%']);
  assert.ok(events.every(event => event.distance === '1.1 m' && event.eventTime === 1234));
});

test('updates only the active event batch', () => {
  const previous = createBatchEvents(['plastic'], 1000, 1).map(event => ({ ...event, status: 'completed' }));
  const current = createBatchEvents(['metal'], 2000, 2);
  const events = updateActiveEventStatuses([...previous, ...current], [current[0].id], 'accepted');
  assert.equal(events[0].status, 'completed');
  assert.equal(events[1].status, 'accepted');
});

test('reset room clears live history', () => {
  const room = freshRoom('ICAN2026');
  assert.deepEqual(room.events, []);
  assert.deepEqual(room.activeEventIds, []);
  assert.equal(room.recordSeq, 0);
});
