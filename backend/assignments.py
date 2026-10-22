"""Extract explicit English commitments without confusing speaker and assignee."""
import re

TOKEN = r"[^\W\d_][\w'’.-]*"
INVALID = set('i we you he she they it someone somebody anyone everyone team product backend frontend today tomorrow please then also and the a this that who which there what review testing nobody no'.split())


def extract_assignments(transcript, attendees=''):
    people = [p.strip() for p in re.split(r'[,;\n]', attendees) if p.strip()]
    speaker = ''
    actions = []
    for sentence in re.split(r'(?<=[.!?।])\s+|\n+', transcript):
        text = sentence.strip()
        label = re.match(rf'^({TOKEN}(?:[ \t]+{TOKEN}){{0,3}}|Speaker \d+):[ \t]*', text)
        if label:
            speaker = label[1]
            text = text[label.end():]
        subject = rf'{TOKEN}(?:[ \t]+{TOKEN}){{0,2}}'
        clauses = []
        for part in re.split(r'[,;]', text):
            start = 0
            for conjunction in re.finditer(rf'\band\s+(?={subject}\s+(?:will|must|needs? to)\b)', part, re.I):
                if re.search(r'\b(will|must|needs? to)\b', part[start:conjunction.start()], re.I):
                    clauses.append(part[start:conjunction.start()])
                    start = conjunction.end()
            clauses.append(part[start:])
        for raw in clauses:
            clause = raw.strip()
            if not re.search(r'\b(will|must|need to|needs to|action item|assigned|to.do)\b', clause, re.I):
                continue
            if re.search(r"\?|\b(if|unless|might|maybe|whether|not|never|won't|would|could)\b", clause, re.I):
                continue
            owner, task = 'Not specified', clause
            commitment = re.search(r'\b(will|must|needs? to)\s+(.+)', clause, re.I)
            if commitment:
                prefix = clause[:commitment.start()].strip()
                name = ''
                if re.search(r'\bI$', prefix, re.I):
                    if speaker and not re.match(r'^(Speaker \d+|Unknown speaker)$', speaker, re.I):
                        name = speaker
                else:
                    name = next((p for p in sorted(people, key=len, reverse=True) if re.search(rf'(?:^|\s){re.escape(p)}$', prefix, re.I)), '')
                    joint = re.search(rf'({TOKEN})\s+and\s+({TOKEN})$', prefix, re.I)
                    if joint and all(p.lower() not in INVALID for p in joint.groups()):
                        name = ' and '.join(next((p for p in people if p.lower() == n.lower()), n[0].upper()+n[1:]) for n in joint.groups())
                    if not name:
                        candidate = re.search(rf'({TOKEN})$', prefix)
                        if candidate and candidate[1].lower() not in INVALID:
                            name = candidate[1]
                if name:
                    owner = next((p for p in people if p.lower() == name.lower()), name[0].upper() + name[1:])
                    task = commitment[2].rstrip('.!।').strip()
            action = {'task': task[:2000], 'owner': owner[:200], 'due': 'Not specified'}
            if not any(a['task'].lower() == action['task'].lower() and a['owner'].lower() == action['owner'].lower() for a in actions):
                actions.append(action)
    return actions[:50]
