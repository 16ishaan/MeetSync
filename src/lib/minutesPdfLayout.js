export const PDF_PAGE = { width: 1240, height: 1754, margin: 80, bottom: 1620 };
const C = { paper: '#faf8f1', ink: '#211d29', body: '#393440', muted: '#777264', gold: '#a77832', line: '#ded6bf', card: '#f1ecd9' };
const sans = 'Arial, "Nirmala UI", sans-serif';
const serif = 'Georgia, "Times New Roman", "Nirmala UI", serif';
function graphemes(text) {
  return typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment)
    : Array.from(text);
}

// Wrap prose and unbroken URLs without breaking joined Unicode characters.
export function wrapPdfText(ctx, value, maxWidth) {
  const lines = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    let line = '';
    for (const token of paragraph.split(/(\s+)/u).filter(Boolean)) {
      if (ctx.measureText(line + token).width <= maxWidth) { line += token; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
      if (!token.trim()) continue;
      for (const char of graphemes(token)) {
        if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function renderMinutesPages(ctx, minutes, onPage) {
  const {width, height, margin, bottom} = PDF_PAGE;
  const full = width - 2 * margin;
  let y = margin, page = 0;
  ctx.textBaseline = 'top';
  const font = (size=23, weight=400, family=sans, color=C.body) => { ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = color; };
  const rule = top => { ctx.fillStyle = C.line; ctx.fillRect(margin, top, full, 1); };
  const label = (text, x, top, size=17) => {
    font(size,600,sans,C.gold);
    let left = x;
    for (const char of text.toUpperCase()) { ctx.fillText(char,left,top); left += ctx.measureText(char).width + 3; }
  };
  const rounded = (x,top,w,h,r=12,fill=C.card,stroke='') => {
    ctx.beginPath(); ctx.moveTo(x+r,top);
    ctx.arcTo(x+w,top,x+w,top+h,r); ctx.arcTo(x+w,top+h,x,top+h,r);
    ctx.arcTo(x,top+h,x,top,r); ctx.arcTo(x,top,x+w,top,r); ctx.closePath();
    if (fill) { ctx.fillStyle=fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
  };
  const begin = (continued=false) => {
    ctx.fillStyle=C.paper; ctx.fillRect(0,0,width,height); y=margin;
    if (continued) {
      label('MEETSYNC / MEETING NOTES', margin, y, 14);
      font(19,400,serif,C.ink);
      let title=minutes.title || 'Meeting minutes';
      while (ctx.measureText(title).width > full-200) title=title.slice(0,-2);
      ctx.fillText(title,margin,y+32); rule(y+67); y+=100;
    }
  };
  const finish = () => {
    rule(1660); font(16,400,sans,C.muted);
    ctx.fillText('MEETSYNC  /  MINUTES OF MEETING',margin,1684);
    const right = `Review before sharing  ·  ${page+1}`;
    ctx.fillText(right,width-margin-ctx.measureText(right).width,1684);
    onPage(page++);
  };
  const ensure = space => { if (y+space > bottom) { finish(); begin(true); } };
  const text = (value,{size=23,weight=400,color=C.body,x=margin,maxWidth=full,lineHeight=Math.ceil(size*1.55),gap=14,family=sans}={}) => {
    font(size,weight,family,color);
    const lines=wrapPdfText(ctx,value,maxWidth);
    for (const line of lines) { ensure(lineHeight); font(size,weight,family,color); ctx.fillText(line,x,y); y+=lineHeight; }
    y+=gap;
  };
  const heading = (name,reserve=160) => { ensure(reserve); y+=25; label(name,margin,y); y+=43; };
  const numbered = (name,items) => {
    heading(name);
    const cleaned=(items || []).map(String).filter(s=>s.trim());
    if (!cleaned.length) { text('None recorded.',{color:C.muted}); return; }
    cleaned.forEach((item,index) => {
      font(23);
      const lines=wrapPdfText(ctx,item,full-64);
      let offset=0;
      while (offset<lines.length) {
        ensure(66);
        const count=Math.min(lines.length-offset, Math.floor((bottom-y-26)/36));
        font(24,400,serif,C.gold); ctx.fillText(offset ? '…' : String(index+1).padStart(2,'0'),margin,y+1);
        font(23);
        for (let i=0;i<count;i++) ctx.fillText(lines[offset+i],margin+64,y+i*36);
        y+=count*36+22; rule(y-8); y+=12; offset+=count;
      }
    });
  };
  const actions = items => {
    const cleaned=(items || []).filter(a=>a.task?.trim());
    // Reserve enough room for the first card as well as its section label.
    let firstHeight=90;
    if (cleaned.length) {
      font(22,600);
      firstHeight=Math.max(76,wrapPdfText(ctx,cleaned[0].task,full-490).length*34+32)+14;
    }
    heading('Action items',Math.min(firstHeight+68,bottom-180));
    if (!cleaned.length) { text('None recorded.',{color:C.muted}); return; }
    for (const action of cleaned) {
      const owner=String(action.owner || '').trim() || 'Not specified';
      const due=String(action.due || '').trim() || 'Not specified';
      const dueText=due === 'Not specified' ? 'Due not set' : /^due\b/i.test(due) ? due : `Due ${due}`;
      font(20); const ownerWidth=ctx.measureText(owner).width;
      font(18); const dueWidth=ctx.measureText(dueText).width+30;
      const compact=ownerWidth<=230 && dueWidth<=200;
      font(22,600);
      const taskLines=wrapPdfText(ctx,action.task,compact ? full-490 : full-40);
      const meta=[];
      if (!compact) {
        font(19);
        for (const item of [`Owner: ${owner}`,`Due: ${due}`]) meta.push(...wrapPdfText(ctx,item,full-40));
      }
      const lines=[...taskLines.map(t=>({text:t,task:true})),...meta.map(t=>({text:t,task:false}))];
      let offset=0;
      const totalHeight=Math.max(76,lines.length*34+32);
      if (totalHeight<=bottom-260) ensure(totalHeight+14);
      while (offset<lines.length) {
        ensure(90);
        const count=Math.min(lines.length-offset,Math.floor((bottom-y-32)/34));
        const h=Math.max(76,count*34+32);
        rounded(margin,y,full,h);
        lines.slice(offset,offset+count).forEach((line,i)=> {
          font(line.task?22:19,line.task?600:400,sans,line.task?C.body:C.muted);
          ctx.fillText(line.text,margin+20,y+18+i*34);
        });
        if (compact) {
          font(20,400,sans,C.muted); ctx.fillText(owner,width-margin-225-ownerWidth,y+Math.max(18,(h-24)/2));
          rounded(width-margin-20-dueWidth,y+(h-36)/2,dueWidth,36,18,'', '#d6bd83');
          font(18,600,sans,C.gold); ctx.fillText(dueText,width-margin-5-dueWidth,y+(h-36)/2+8);
        }
        y+=h+14; offset+=count;
      }
    }
  };

  begin();
  label('Minutes of meeting',margin,y);
  const dateValue=String(minutes.date || 'Not specified');
  let date=dateValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const parsed=new Date(`${dateValue}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) date=parsed.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }
  font(18,600,sans,C.ink); ctx.fillText('Date',width-margin-235,y+1);
  font(18,400,sans,C.muted);
  wrapPdfText(ctx,date,180).forEach((line,i)=>ctx.fillText(line,width-margin-180,y+i*26));
  y+=50;
  text(minutes.title || 'Meeting minutes',{size:51,family:serif,weight:600,lineHeight:61,gap:25});
  rule(y); y+=31;
  label('Attendees',margin,y+12,15);
  let x=margin+160;
  const names=String(minutes.attendees || '').split(/[,;\n]/).map(n=>n.trim()).filter(Boolean);
  if (!names.length) { font(21,400,sans,C.muted); ctx.fillText('Not specified',x,y+10); y+=62; }
  else {
    for (const [index,name] of names.entries()) {
      font(20);
      const lines=wrapPdfText(ctx,name,full-230);
      for (let i=0;i<lines.length;i++) {
        font(20); const w=ctx.measureText(lines[i]).width+70;
        if (x+w>width-margin) { y+=59; x=margin+160; }
        if (y+55>bottom) { finish(); begin(true); label('Attendees',margin,y+12,15); x=margin+160; }
        if (i===0) {
          const words=name.split(/\s+/u);
          const initials=[graphemes(words[0])[0],words.length>1?graphemes(words.at(-1))[0]:''].join('').toUpperCase();
          ctx.fillStyle=['#7861bd','#ac6748','#bd6485','#4f8c72'][index%4];
          ctx.beginPath(); ctx.arc(x+19,y+23,20,0,Math.PI*2); ctx.fill();
          font(15,600,sans,'#ffffff'); ctx.fillText(initials,x+19-ctx.measureText(initials).width/2,y+15);
        }
        font(20); ctx.fillText(lines[i],x+49,y+11); x+=w;
      }
    }
    y+=70;
  }
  heading('Summary'); text(minutes.summary || 'None recorded.');
  numbered('Key decisions',minutes.decisions);
  actions(minutes.actions);
  if ((minutes.discussion || []).some(s=>s.trim())) numbered('Discussion',minutes.discussion);
  numbered('Next steps',minutes.next_steps);
  if (minutes.notice) { heading('Draft note'); text(minutes.notice,{size:18,color:C.muted,lineHeight:28}); }
  finish();
  return page;
}
