export interface UserSession {
  token: string;
  fullName: string;
  email: string;
  role: string;
}

const DB_NAME = "TaskManagementAuthDB";
const STORE_NAME = "session";
const SESSION_KEY = "current";

function openAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: UserSession): Promise<void> {
  const db = await openAuthDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session, SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getValidUserSession(): Promise<UserSession | null> {
  try {
    const db = await openAuthDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
      req.onsuccess = () => {
        db.close();
        const data: unknown = req.result;
        if (
          data !== null &&
          typeof data === "object" &&
          "token" in data &&
          typeof data.token === "string" &&
          "fullName" in data &&
          typeof data.fullName === "string" &&
          "role" in data &&
          typeof data.role === "string"
        ) {
          resolve(data as UserSession);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function getToken(): Promise<string | null> {
  const session = await getValidUserSession();
  return session ? session.token : null;
}

export async function clearSession(): Promise<void> {
  const db = await openAuthDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(SESSION_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}