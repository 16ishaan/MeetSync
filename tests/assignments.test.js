import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAssignments, formatSpeakerTranscript } from '../src/lib/assignments.js';

test('speaker is not the owner of tasks assigned to other people, including lower-case live speech', () => {
  const actions = extractAssignments('Ishaan: hello everyone today jigisha will do the review for the product and risheek will do the backend testing');
  assert.deepEqual(actions.map(({owner,task}) => ({owner,task})), [
    {owner:'Jigisha',task:'do the review for the product'}, {owner:'Risheek',task:'do the backend testing'}
  ]);
});
test('resolves first person only from named speaker turns, preserving names and unknown pronouns', () => {
  const actions = extractAssignments('Ishaan: I will prepare the demo.\nJigisha: I will review the product. She will share the notes.\nSpeaker 1: I will check the tests.');
  assert.deepEqual(actions.map(a => a.owner), ['Ishaan','Jigisha','Not specified','Not specified']);
  assert.equal(extractAssignments('jigisha shah will review the product', 'Jigisha Shah')[0].owner, 'Jigisha Shah');
});
test('does not turn negations, questions or hypotheses into assignments', () => {
  for (const text of ['Jigisha will not review the product.', 'If Risheek will test the backend we can ship.', 'Will Jigisha review the product?', 'Jigisha might review the product.']) assert.deepEqual(extractAssignments(text), []);
  assert.equal(extractAssignments('We need to review the product.')[0].owner, 'Not specified');
});
test('keeps compound tasks and joint owners intact, splitting new explicit subjects', () => {
  assert.deepEqual(extractAssignments('Jigisha will review and test the product.').map(a => a.task), ['review and test the product']);
  assert.equal(extractAssignments('Jigisha and Risheek will review the product.')[0].owner, 'Jigisha and Risheek');
  assert.deepEqual(extractAssignments('Jigisha will review AND Risheek will test.').map(a => a.owner), ['Jigisha','Risheek']);
});
test('speaker renaming reaches transcript and self-assigned tasks without changing mentioned names', () => {
  const text = formatSpeakerTranscript([{speaker:'Speaker 1',text:'I will review. Risheek will test.',start:0,end:4}], {'Speaker 1':'Jigisha'});
  assert.equal(text, 'Jigisha: I will review. Risheek will test.');
  assert.deepEqual(extractAssignments(text).map(a => a.owner), ['Jigisha','Risheek']);
});
