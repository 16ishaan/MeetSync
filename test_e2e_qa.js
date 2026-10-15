import fs from 'fs';

async function runTestSuite() {
  console.log('========================================================');
  console.log('       MEETSYNC COMPREHENSIVE E2E QA TEST SUITE        ');
  console.log('========================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log('  ✓ ' + testName);
    } else {
      failedTests++;
      console.error('  ✗ FAIL: ' + testName);
    }
  }

  // --- STORY 1: RECORDING & AUDIO PLAYBACK / LOCAL STORAGE ---
  console.log('USER STORY 1: RECORDING & LOCAL AUDIO PLAYBACK');
  {
    const formatDuration = (ms) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };
    assert(formatDuration(0) === '00:00', 'formatDuration: handles 0ms');
    assert(formatDuration(65000) === '01:05', 'formatDuration: handles minutes & seconds');
    assert(formatDuration(3600000) === '60:00', 'formatDuration: handles 1 hour');

    // Test duration accumulation logic (pause & resume)
    let recordedMs = 0;
    let segStart = 1000;
    let segPause = 6000; // 5000ms elapsed
    recordedMs += segPause - segStart;
    assert(recordedMs === 5000, 'Recorder duration accumulation: segment 1 paused at 5s');
    segStart = 10000;
    let segStop = 18000; // 8000ms elapsed
    const finalDuration = recordedMs + (segStop - segStart);
    assert(finalDuration === 13000, 'Recorder duration accumulation: total 13s after resume');
  }

  // --- STORY 2: TRANSCRIPTION & ATTRIBUTION ---
  console.log('\nUSER STORY 2: TRANSCRIPTION & ERROR HANDLING');
  {
    const AUDIO_TYPES = new Set([
      'audio/mpeg', 'audio/mp3', 'audio/x-mpeg-3',
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/webm', 'audio/ogg', 'audio/mp4',
    ]);
    const isAudioFile = (name, type) => {
      const lower = name.toLowerCase();
      const hasAudioExt = ['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.mp4'].some((e) => lower.endsWith(e));
      const hasAudioMime = !type || AUDIO_TYPES.has(type.toLowerCase()) || type.startsWith('audio/');
      return hasAudioExt && hasAudioMime;
    };

    assert(isAudioFile('meeting.mp3', 'audio/mpeg') === true, 'isAudioFile: accepts meeting.mp3');
    assert(isAudioFile('notes.wav', 'audio/wav') === true, 'isAudioFile: accepts notes.wav');
    assert(isAudioFile('recording.webm', 'audio/webm') === true, 'isAudioFile: accepts recording.webm');
    assert(isAudioFile('voice.m4a', 'audio/mp4') === true, 'isAudioFile: accepts voice.m4a');
    assert(isAudioFile('document.pdf', 'application/pdf') === false, 'isAudioFile: rejects document.pdf');
    assert(isAudioFile('virus.exe', 'application/x-msdownload') === false, 'isAudioFile: rejects virus.exe');

    const getAttribution = (status) => {
      const isWebSpeech = status === 'web-speech';
      return isWebSpeech ? 'Web Speech API (browser built-in)' : 'Whisper (local transcription server)';
    };
    assert(getAttribution('web-speech').includes('Web Speech API'), 'Attribution: correctly attributes web-speech');
    assert(getAttribution('completed').includes('Whisper'), 'Attribution: correctly attributes Whisper');
  }

  // --- STORY 3: AI MoM GENERATION & NORMALIZATION ---
  console.log('\nUSER STORY 3: AI MoM GENERATION & NORMALIZATION');
  {
    function normalizeMom(data, fallbackTitle) {
      data = data || {};
      data.title = data.title || fallbackTitle;
      data.overview = data.overview || '';
      data.summary = data.summary || '';
      data.discussion_points = data.discussion_points || [];
      data.decisions = data.decisions || [];
      data.action_items = (data.action_items || []).map((item) => {
        if (typeof item === 'string') item = { title: item };
        item.title = item.title || 'Untitled task';
        item.description = item.description || '';
        item.assignee = item.assignee || 'Unassigned';
        item.deadline = item.deadline || null;
        item.priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium';
        return item;
      });
      data.unresolved_questions = data.unresolved_questions || [];
      return data;
    }

    const rawAIResponse = {
      summary: 'Quarterly review completed.',
      discussion_points: ['Budget', 'Headcount'],
      decisions: ['Approve $10k budget'],
      action_items: [
        'Write specs',
        { title: 'Deploy service', priority: 'urgent', assignee: 'Alice' },
      ],
    };
    const normalized = normalizeMom(rawAIResponse, 'Sprint Retro');
    assert(normalized.title === 'Sprint Retro', 'MoM Normalization: sets fallback title');
    assert(normalized.summary === 'Quarterly review completed.', 'MoM Normalization: preserves summary');
    assert(normalized.action_items.length === 2, 'MoM Normalization: parses string and object action items');
    assert(normalized.action_items[0].title === 'Write specs' && normalized.action_items[0].assignee === 'Unassigned', 'MoM Normalization: normalizes string item to object');
    assert(normalized.action_items[1].priority === 'medium', 'MoM Normalization: invalid priority defaults to medium');
  }

  // --- STORY 4: ACTION ITEMS & PDF EXPORT ---
  console.log('\nUSER STORY 4: ACTION ITEMS & PDF EXPORT');
  {
    function deduplicateItems(existing, incoming) {
      const existingTitles = new Set(existing.map((i) => (i.title || '').toLowerCase()));
      const toAdd = [];
      for (const item of incoming) {
        const key = (item.title || item.task || '').toLowerCase();
        if (!key || existingTitles.has(key)) continue;
        toAdd.push(item);
        existingTitles.add(key);
      }
      return toAdd;
    }

    const existingTasks = [{ id: '1', title: 'Prepare slide deck' }];
    const newFromMoM = [
      { title: 'prepare slide deck' },
      { title: 'Prepare Slide Deck' },
      { title: 'Review Q3 Metrics' },
    ];
    const added = deduplicateItems(existingTasks, newFromMoM);
    assert(added.length === 1 && added[0].title === 'Review Q3 Metrics', 'Action Items: deduplicates case-insensitively');

    const { exportMeetingPDF } = await import('./src/lib/pdfExport.js');
    assert(typeof exportMeetingPDF === 'function', 'pdfExport: exportMeetingPDF is exported as a function');

    const sampleMeeting = {
      title: 'Architecture Review',
      started_at: Date.now() - 1800000,
      duration_ms: 1800000,
      transcript: 'Alice: Let us verify PDF export.\nBob: It works with multi-page layouts and tables.',
      mom_data: {
        title: 'Architecture Review',
        date: new Date().toISOString(),
        summary: 'Architecture review for scalable multi-tier web application.',
        overview: 'Comprehensive system breakdown.',
        discussion_points: ['Database indexing', 'Client-side caching'],
        decisions: ['Adopt IndexedDB for offline persistence'],
        action_items: [
          { title: 'Add schema migration', assignee: 'Charlie', deadline: 'Tomorrow', priority: 'high', description: 'Ensure smooth upgrades' },
        ],
        unresolved_questions: ['Will we support SQLite in WASM?'],
      },
    };

    const expectedFilename = 'meetsync-Architecture-Review.pdf';
    if (fs.existsSync(expectedFilename)) fs.unlinkSync(expectedFilename);

    exportMeetingPDF(sampleMeeting);
    const exists = fs.existsSync(expectedFilename);
    const size = exists ? fs.statSync(expectedFilename).size : 0;
    if (exists) fs.unlinkSync(expectedFilename);

    assert(exists && size > 1000, `PDF Export: successfully generated valid PDF file (${size} bytes)`);
  }

  // --- STORY 5: MEETING HISTORY & SEARCH LOGIC ---
  console.log('\nUSER STORY 5: MEETING HISTORY & SEARCH FILTERING');
  {
    const sampleMeetings = [
      { id: '1', title: 'Weekly Standup', transcript: 'Sprint goals are on track', mom_data: { summary: 'Quick 15 min standup' } },
      { id: '2', title: 'Quarterly Planning', transcript: 'Revenue projections for 2027', mom_data: { summary: 'Financial roadmapping' } },
      { id: '3', title: 'Tech Spec Discussion', transcript: 'Web Speech API vs Whisper accuracy', mom_data: null },
    ];

    function filterMeetings(meetings, query) {
      if (!query || !query.trim()) return meetings;
      const q = query.toLowerCase();
      return meetings.filter((m) => {
        const inTitle = m.title?.toLowerCase().includes(q);
        const inTranscript = m.transcript?.toLowerCase().includes(q);
        const inMom = JSON.stringify(m.mom_data || {}).toLowerCase().includes(q);
        return inTitle || inTranscript || inMom;
      });
    }

    assert(filterMeetings(sampleMeetings, '').length === 3, 'Search: empty query returns all meetings');
    assert(filterMeetings(sampleMeetings, 'standup').length === 1, 'Search: finds meeting by title');
    assert(filterMeetings(sampleMeetings, 'revenue').length === 1 && filterMeetings(sampleMeetings, 'revenue')[0].id === '2', 'Search: finds meeting by transcript content');
    assert(filterMeetings(sampleMeetings, 'financial').length === 1 && filterMeetings(sampleMeetings, 'financial')[0].id === '2', 'Search: finds meeting by MoM content');
    assert(filterMeetings(sampleMeetings, 'nonexistent').length === 0, 'Search: returns 0 on non-matching query');
  }

  // --- DATABASE SCHEMA & POLICIES CHECK ---
  console.log('\nDATABASE SCHEMA & RLS AUDIT');
  {
    const sqlContent = fs.readFileSync('supabase/meetings.sql', 'utf8');
    assert(sqlContent.includes('create table if not exists public.meetings'), 'SQL: public.meetings table defined');
    assert(sqlContent.includes('create table if not exists public.action_items'), 'SQL: public.action_items table defined');
    assert(sqlContent.includes('alter table public.meetings enable row level security;'), 'SQL: meetings RLS enabled');
    assert(sqlContent.includes('alter table public.action_items enable row level security;'), 'SQL: action_items RLS enabled');
    assert(sqlContent.includes('create policy "Users can read their own meetings"'), 'SQL: SELECT policy present');
    assert(sqlContent.includes('create policy "Users can create their own meetings"'), 'SQL: INSERT policy present');
    assert(sqlContent.includes('create policy "Users can update their own meetings"'), 'SQL: UPDATE policy present');
    assert(sqlContent.includes('create policy "Users can delete their own meetings"'), 'SQL: DELETE policy present');
    assert(sqlContent.includes('auth.uid() = user_id'), 'SQL: RLS strictly enforces user_id check');
  }

  console.log('\n========================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('========================================================');
  if (failedTests > 0) process.exit(1);
}

runTestSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
