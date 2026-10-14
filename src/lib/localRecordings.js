const DATABASE_NAME = "meetsync-recordings";
const STORE_NAME = "recordings";

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function saveLocalRecording({ blob, durationMs }) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).add({
      blob,
      durationMs: Math.round(durationMs),
      createdAt: Date.now(),
    });
    transaction.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function getLatestLocalRecording() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .openCursor(null, "prev");
    request.onsuccess = () => {
      database.close();
      resolve(request.result?.value || null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function deleteLocalRecording(id) {
  if (!id) return;
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function getAllLocalRecordings() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => {
      database.close();
      resolve(request.result.sort((left, right) => right.createdAt - left.createdAt));
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}