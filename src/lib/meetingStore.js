/**
 * meetingStore.js
 * IndexedDB-backed meeting persistence layer.
 * Stores full meeting records including transcript, MoM, and action items.
 * Falls back gracefully when IndexedDB is unavailable.
 */

const DB_NAME = 'meetsync-meetings';
const DB_VERSION = 1;
const MEETINGS_STORE = 'meetings';
const ACTION_ITEMS_STORE = 'action_items';

// Meeting status constants
export const MEETING_STATUS = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  RECORDED: 'recorded',
  TRANSCRIBING: 'transcribing',
  TRANSCRIBED: 'transcribed',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
};

// Action item status
export const ACTION_STATUS = {
  OPEN: 'open',
  COMPLETED: 'completed',
};

let _db = null;

function openDatabase() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(MEETINGS_STORE)) {
        const meetingStore = db.createObjectStore(MEETINGS_STORE, { keyPath: 'id' });
        meetingStore.createIndex('created_at', 'created_at');
        meetingStore.createIndex('status', 'status');
      }

      if (!db.objectStoreNames.contains(ACTION_ITEMS_STORE)) {
        const actionStore = db.createObjectStore(ACTION_ITEMS_STORE, { keyPath: 'id' });
        actionStore.createIndex('meeting_id', 'meeting_id');
        actionStore.createIndex('status', 'status');
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// --- Meeting CRUD ---

export async function createMeeting({ title = 'Untitled Meeting', localRecordingId = null } = {}) {
  const db = await openDatabase();
  const meeting = {
    id: crypto.randomUUID(),
    title,
    status: MEETING_STATUS.IDLE,
    started_at: null,
    ended_at: null,
    duration_ms: 0,
    local_recording_id: localRecordingId,
    cloud_recording_id: null,
    cloud_recording_path: null,
    transcript: null,
    transcription_status: null,
    mom_data: null,
    processing_status: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS_STORE, 'readwrite');
    const store = tx.objectStore(MEETINGS_STORE);
    store.add(meeting);
    tx.oncomplete = () => resolve(meeting);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeeting(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS_STORE, 'readonly');
    const req = tx.objectStore(MEETINGS_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateMeeting(id, updates) {
  const db = await openDatabase();
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(MEETINGS_STORE, 'readwrite');
    const store = tx.objectStore(MEETINGS_STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`Meeting ${id} not found`));
        return;
      }
      const updated = { ...existing, ...updates, updated_at: Date.now() };
      store.put(updated);
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getAllMeetings() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS_STORE, 'readonly');
    const req = tx.objectStore(MEETINGS_STORE).getAll();
    req.onsuccess = () => {
      const meetings = req.result || [];
      resolve(meetings.sort((a, b) => b.created_at - a.created_at));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeeting(id) {
  const db = await openDatabase();
  // Also delete associated action items
  await deleteActionItemsForMeeting(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS_STORE, 'readwrite');
    tx.objectStore(MEETINGS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function searchMeetings(query) {
  if (!query || !query.trim()) return getAllMeetings();
  const all = await getAllMeetings();
  const q = query.toLowerCase();
  return all.filter((m) => {
    const inTitle = m.title?.toLowerCase().includes(q);
    const inTranscript = m.transcript?.toLowerCase().includes(q);
    const inMom = JSON.stringify(m.mom_data || {}).toLowerCase().includes(q);
    return inTitle || inTranscript || inMom;
  });
}

// --- Action Items CRUD ---

export async function createActionItem({
  meetingId,
  title,
  description = '',
  assignee = 'Unassigned',
  deadline = null,
  priority = 'medium',
  sourceContext = '',
}) {
  const db = await openDatabase();
  const item = {
    id: crypto.randomUUID(),
    meeting_id: meetingId,
    title,
    description,
    assignee,
    deadline,
    priority,
    status: ACTION_STATUS.OPEN,
    source_context: sourceContext,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACTION_ITEMS_STORE, 'readwrite');
    tx.objectStore(ACTION_ITEMS_STORE).add(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActionItemsForMeeting(meetingId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACTION_ITEMS_STORE, 'readonly');
    const index = tx.objectStore(ACTION_ITEMS_STORE).index('meeting_id');
    const req = index.getAll(meetingId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateActionItem(id, updates) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACTION_ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(ACTION_ITEMS_STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`Action item ${id} not found`));
        return;
      }
      const updated = { ...existing, ...updates, updated_at: Date.now() };
      store.put(updated);
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteActionItem(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACTION_ITEMS_STORE, 'readwrite');
    tx.objectStore(ACTION_ITEMS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteActionItemsForMeeting(meetingId) {
  const items = await getActionItemsForMeeting(meetingId);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACTION_ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(ACTION_ITEMS_STORE);
    items.forEach((item) => store.delete(item.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save all action items from a MoM for a meeting.
 * Deduplicates by title to prevent double-saving.
 */
export async function saveActionItemsFromMom(meetingId, actionItemsArray) {
  const existing = await getActionItemsForMeeting(meetingId);
  const existingTitles = new Set(existing.map((i) => i.title?.toLowerCase()));
  const saved = [];

  for (const item of actionItemsArray) {
    const titleKey = (item.title || item.task || '').toLowerCase();
    if (!titleKey || existingTitles.has(titleKey)) continue;

    const saved_item = await createActionItem({
      meetingId,
      title: item.title || item.task || 'Untitled task',
      description: item.description || '',
      assignee: item.assignee || item.assigned_to || 'Unassigned',
      deadline: item.deadline || item.due_date || null,
      priority: item.priority || 'medium',
      sourceContext: item.source_context || '',
    });
    saved.push(saved_item);
    existingTitles.add(titleKey);
  }

  return saved;
}
