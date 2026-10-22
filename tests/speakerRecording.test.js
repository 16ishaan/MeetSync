import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSpeakerRecording, MAX_SPEAKER_BYTES } from '../src/lib/speakerRecording.js';

function fixture() {
  let stops = 0;
  const mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stops++ }] }) };
  class Recorder {
    static isTypeSupported(type) { return type.includes('webm'); }
    constructor(stream, options) { Recorder.instance = this; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({data:new Blob(['final audio chunk'])});
      this.onstop();
    }
  }
  return {mediaDevices, Recorder, stops:() => stops};
}
test('recording finalizes audio and releases microphone, including repeated Stop', async () => {
  const f = fixture();
  const capture = await startSpeakerRecording({...f,onLimit:() => {}});
  const blob = await capture.stop();
  assert.equal(await blob.text(), 'final audio chunk');
  assert.equal(blob.type, 'audio/webm;codecs=opus');
  assert.equal(f.stops(), 1);
  assert.equal(await capture.stop(), blob);
});
test('cancel discards audio and releases tracks; size cap never exports oversized audio', async () => {
  const f = fixture();
  const capture = await startSpeakerRecording({...f,onLimit:() => {}});
  capture.cancel();
  assert.equal(await capture.stop(), null);
  assert.ok(f.stops() > 0);
  const g = fixture();
  const messages = [];
  const capped = await startSpeakerRecording({...g,onLimit:m => messages.push(m)});
  g.Recorder.instance.ondataavailable({data:{size:MAX_SPEAKER_BYTES+1}});
  assert.equal(await capped.stop(), null);
  assert.ok(messages[0].includes('30 MB'));
  assert.ok(g.stops() > 0);
});
test('recorder construction failure releases the acquired microphone', async () => {
  const f = fixture();
  f.Recorder.isTypeSupported = () => { throw new Error('unsupported'); };
  await assert.rejects(startSpeakerRecording({...f,onLimit:() => {}}), /unsupported/);
  assert.equal(f.stops(), 1);
});
