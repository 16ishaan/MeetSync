import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechSession } from '../src/lib/speechRecognition.js';

class Recognition {
  constructor() { Recognition.instance = this; }
  start() { this.onstart(); }
  stop() { this.onend(); }
  abort() { this.aborted = true; }
}

test('updates cumulative results without duplicating interim or final words', () => {
  const texts = [];
  const states = [];
  const errors = [];
  const session = createSpeechSession({ Recognition, language: 'en-IN', onText: (...text) => texts.push(text), onState: state => states.push(state), onError: error => errors.push(error) });
  session.start();
  const r = Recognition.instance;
  const result = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal });
  r.onresult({ results: [result('Hello', true), result('wor', false)] });
  r.onresult({ results: [result('Hello', true), result('world', true)] });
  assert.deepEqual(texts, [['Hello', 'wor'], ['Hello world', '']]);
  assert.equal(r.lang, 'en-IN');
  assert.equal(r.continuous, true);
  assert.equal(r.interimResults, true);
  r.onerror({ error: 'not-allowed' });
  assert.deepEqual(errors, ['not-allowed']);
  session.stop();
  assert.deepEqual(states, ['listening', 'idle']);
  const pendingCallback = r.onresult;
  session.dispose();
  assert.equal(r.aborted, true);
  assert.equal(r.onresult, null);
  pendingCallback({ results: [result('late result', true)] });
  assert.equal(texts.length, 2);
});
