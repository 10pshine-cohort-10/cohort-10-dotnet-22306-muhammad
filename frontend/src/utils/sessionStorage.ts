export interface UserSession {
  token: string;
  fullName: string;
  email: string;
  role: string;
}

const DB_NAME = "TaskManagementAuthDB";
const STORE_NAME = "session";
const SESSION_KEY = "current";
const CHANNEL_NAME = "task_management_auth_sync";

function notifySessionChanged(): void {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: "SESSION_UPDATED" });
    channel.close();
  }
}

export function subscribeToSessionChanges(onChange: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = () => onChange();
  return () => channel.close();
}

function openAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function isValidUserSession(data: unknown): data is UserSession {
  return (
    data !== null &&
    typeof data === "object" &&
    "token" in data &&
    typeof data.token === "string" &&
    "fullName" in data &&
    typeof data.fullName === "string" &&
    "role" in data &&
    typeof data.role === "string"
  );
}

export async function saveSession(session: UserSession): Promise<void> {
  const db = await openAuthDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session, SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB write transaction failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB write transaction aborted."));
    };
  });
  notifySessionChanged();
}

export async function getValidUserSession(): Promise<UserSession | null> {
  const db = await openAuthDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    req.onsuccess = () => {
      db.close();
      const data: unknown = req.result;
      resolve(isValidUserSession(data) ? data : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error("IndexedDB read request failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB read transaction aborted."));
    };
  });
}

export async function getToken(): Promise<string | null> {
    const session = await getValidUserSession();
    return session ? session.token : null;
}
export async function clearSession(expectedToken?: string): Promise<boolean> {
  const db = await openAuthDb();
  let deleted = false;
  
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    if (expectedToken === undefined) {
      store.delete(SESSION_KEY);
      deleted = true;
    } else {
      const getReq = store.get(SESSION_KEY);
      getReq.onsuccess = () => {
        const stored: unknown = getReq.result;
        if (isValidUserSession(stored) && stored.token === expectedToken) {
          store.delete(SESSION_KEY);
          deleted = true;
        }
      };
      getReq.onerror = () => {
        reject(getReq.error ?? new Error("IndexedDB read before delete failed."));
      };
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB delete transaction failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB delete transaction aborted."));
    };
  });
  if (deleted) {
    notifySessionChanged();
  }
  return deleted;
}