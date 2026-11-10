const prefix = userId => `meetsync-mom-history:${encodeURIComponent(userId || "guest")}:`;
export const legacyDraftId = "saved-browser-draft";

export function archiveMinutes(userId, id, minutes) {
  localStorage.setItem(prefix(userId) + id, JSON.stringify({ id, minutes, savedAt: Date.now() }));
}

export function readMinutesHistory(userId) {
  const entries = new Map();
  const keyPrefix = prefix(userId);
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(keyPrefix)) continue;
    const entry = JSON.parse(localStorage.getItem(key));
    entries.set(entry.id, entry);
  }
  const draft = JSON.parse(localStorage.getItem(`meetsync-mom-v1-${userId || "guest"}`));
  if (draft?.minutes && !entries.has(draft.historyId || legacyDraftId)) {
    const id = draft.historyId || legacyDraftId;
    entries.set(id, { id, minutes: draft.minutes, savedAt: 0 });
  }
  return [...entries.values()].sort((a, b) => b.savedAt - a.savedAt);
}
