import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMinutes } from '../src/lib/localMinutes.js';

test('browser generation works without network or server and preserves source facts', () => {
  const draft = extractMinutes({ title: 'Planning', date: '2026-10-17', transcript: 'We agreed to ship PDF export. Ishaan will test the download before Friday. The next meeting is Monday.' });
  assert.equal(draft.method, 'browser-extractive');
  assert.equal(draft.decisions[0], 'We agreed to ship PDF export.');
  assert.equal(draft.actions[0].owner, 'Not specified');
  assert.equal(draft.actions[0].due, 'Not specified');
  assert.equal(draft.next_steps[0], 'The next meeting is Monday.');
});

test('does not fabricate decisions or actions from general discussion', () => {
  const draft = extractMinutes({ transcript: 'We discussed the product. We reviewed the dashboard.' });
  assert.deepEqual(draft.decisions, []);
  assert.deepEqual(draft.actions, []);
});

test('validates input and bounds long unpunctuated text', () => {
  assert.throws(() => extractMinutes({ transcript: 'short' }));
  assert.throws(() => extractMinutes({ transcript: 'x'.repeat(60001) }));
  const draft = extractMinutes({ transcript: 'x'.repeat(60000) });
  assert.ok(draft.summary.length < 12000);
  assert.ok(draft.discussion.every(s => s.length <= 1500));
});
