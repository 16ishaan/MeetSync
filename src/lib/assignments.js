// Conservative English assignment extraction. A mentioned person is not necessarily speaking.
const nameToken = "[\\p{L}][\\p{L}'’.-]*";
const invalidNames = new Set('i we you he she they it someone somebody anyone everyone team product backend frontend today tomorrow please then also and the a this that who which there what review testing nobody no'.split(' '));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanName = value => value.trim().replace(/\s+/g, ' ');

export function extractAssignments(transcript, attendees = '') {
  const people = attendees.split(/[,;\n]/).map(cleanName).filter(Boolean);
  const canonical = name => people.find(person => person.toLowerCase() === name.toLowerCase()) || name.replace(/^\p{L}/u, c => c.toUpperCase());
  let speaker = '';
  const actions = [];
  for (const sentence of String(transcript || '').split(/(?<=[!?।])\s+|(?<=\.)\s+(?=[\p{L}])|\n+/u)) {
    let text = sentence.trim();
    if (!text) continue;
    const label = text.match(new RegExp(`^(${nameToken}(?:[ \\t]+${nameToken}){0,3}|Speaker \\d+):[ \\t]*`, 'u'));
    if (label) { speaker = label[1]; text = text.slice(label[0].length); }
    // Split only at a new explicit subject + commitment, keeping "review and test" together.
    const subject = `(?:${nameToken})(?:[ \\t]+${nameToken}){0,2}`;
    const clauses = text.split(/[,;]/).flatMap(part => {
      const pieces = [];
      let start = 0;
      for (const match of part.matchAll(new RegExp(`\\band\\s+(?=${subject}\\s+(?:will|must|needs? to)\\b)`, 'giu'))) {
        if (/\b(will|must|needs? to)\b/i.test(part.slice(start, match.index))) {
          pieces.push(part.slice(start, match.index)); start = match.index + match[0].length;
        }
      }
      return [...pieces, part.slice(start)];
    });
    for (const raw of clauses) {
      const clause = raw.trim();
      if (!/\b(will|must|need to|needs to|action item|assigned|to.do)\b/i.test(clause)) continue;
      // Hypotheses, questions, refusals and reported negations are not commitments.
      if (/\?|\b(if|unless|might|maybe|whether|not|never|won't|would|could)\b/i.test(clause)) continue;
      let owner = 'Not specified';
      let task = clause;
      const commitment = clause.match(/\b(will|must|needs? to)\s+(.+)/i);
      if (commitment) {
        const prefix = clause.slice(0, commitment.index).trim();
        let name = '';
        if (/\bI$/i.test(prefix)) {
          if (speaker && !/^(Speaker \d+|Unknown speaker)$/i.test(speaker)) name = speaker;
        } else {
          const known = [...people].sort((a,b) => b.length-a.length).find(person => new RegExp(`(?:^|\\s)${escape(person)}$`, 'iu').test(prefix));
          const joint = prefix.match(new RegExp(`(${nameToken})\\s+and\\s+(${nameToken})$`, 'iu'));
          if (joint && joint.slice(1).every(person => !invalidNames.has(person.toLowerCase()))) name = joint.slice(1).map(canonical).join(' and ');
          else if (known) name = known;
          else {
            const candidate = prefix.match(new RegExp(`(${nameToken})$`, 'u'))?.[1] || '';
            if (candidate && !invalidNames.has(candidate.toLowerCase())) name = candidate;
          }
        }
        if (name) { owner = canonical(name); task = commitment[2].replace(/[.!।]+$/, '').trim(); }
      }
      actions.push({ task: task.slice(0,2000), owner: owner.slice(0,200), due: 'Not specified' });
    }
  }
  return actions.filter((action, index, all) => all.findIndex(a => a.owner.toLowerCase() === action.owner.toLowerCase() && a.task.toLowerCase() === action.task.toLowerCase()) === index).slice(0,50);
}

export function formatSpeakerTranscript(segments, names = {}) {
  return segments.map(segment => `${cleanName(names[segment.speaker] || segment.speaker).replace(/[:\r\n]/g, '')}: ${segment.text.trim()}`).join('\n');
}
