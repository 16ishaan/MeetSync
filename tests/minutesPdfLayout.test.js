import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDF_PAGE, renderMinutesPages, wrapPdfText } from '../src/lib/minutesPdfLayout.js';

function recorder() {
  const pages = [[]];
  let page=0;
  const ctx={font:'400 23px Arial',textBaseline:'top',fillStyle:'',
    measureText(value) { return {width:[...String(value)].length*Number(this.font.match(/(\d+)px/)[1])*.55}; },
    fillText(text,x,y) { pages[page].push({text:String(text),x,y,size:Number(this.font.match(/(\d+)px/)[1])}); },
    fillRect(){},beginPath(){},moveTo(){},arcTo(){},arc(){},closePath(){},fill(){},stroke(){}
  };
  return {ctx,pages,finish(){ page++; pages.push([]); }};
}

test('long tasks, owners, deadlines and unbroken text paginate without clipping or loss', () => {
  const r=recorder();
  const task='Unbroken'.repeat(500);
  renderMinutesPages(r.ctx,{
    title:'A long meeting title '.repeat(8),date:'2026-10-22',attendees:'Ishaan Verma, Jigisha Agarwal',
    summary:'A multilingual review: नमस्ते. '.repeat(100),
    decisions:['Decision '.repeat(300)],
    actions:[{task,owner:'Owner name '.repeat(12),due:'Detailed deadline '.repeat(10)}],
    discussion:[],next_steps:['LAST_CONTENT_MARKER'],notice:'Review before sharing.'
  },r.finish);
  const used=r.pages.filter(p=>p.length);
  assert.ok(used.length>3);
  for (const p of used) for (const item of p) {
    assert.ok(item.y>=0 && item.y+item.size<=PDF_PAGE.height,JSON.stringify(item));
    assert.ok(item.x>=PDF_PAGE.margin,JSON.stringify(item));
    r.ctx.font=`400 ${item.size}px Arial`;
    assert.ok(item.x+r.ctx.measureText(item.text).width<=PDF_PAGE.width-PDF_PAGE.margin+1,JSON.stringify(item));
  }
  const taskFragments=used.flat().filter(t=>t.size===22).map(t=>t.text).join('');
  assert.equal(taskFragments,task);
  assert.ok(used.flat().some(t=>t.text==='LAST_CONTENT_MARKER'));
});

test('Unicode grapheme wrapping preserves joined characters and explicit paragraphs', () => {
  const ctx={measureText:text=>({width:[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length*10})};
  const text='👩‍💻👩‍💻👩‍💻';
  assert.deepEqual(wrapPdfText(ctx,text,20),['👩‍💻👩‍💻','👩‍💻']);
  assert.deepEqual(wrapPdfText(ctx,'One\nTwo',100),['One','Two']);
});
