import type { MmoState } from '../types.ts';

const DB_NAME = 'chromarift_persistent_db';
const DB_VERSION = 1;
const STORE_NAME = 'mmo_state_store';
const STATE_RECORD_KEY = 'chromarift_mmo_state_v3_clean';
const LOCAL_STORAGE_FALLBACK_KEY = 'chromarift_mmo_state_cache_v3_clean';
const ACTIVE_PLAYER_KEY = 'chromarift_active_player_id_v2';
const SESSION_TOKEN_KEY = 'chromarift_session_token_v1';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function purgeLegacyClientKeys(): Promise<void> {
  try {
    localStorage.removeItem('chromarift_mmo_state_cache_v1');
    localStorage.removeItem('chromarift_mmo_state_cache_v2_nodemo');
    localStorage.removeItem('chromarift_active_player_id_v1');
  } catch {
    // Ignore storage error
  }
  try {
    const db = await openIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('chromarift_mmo_state_v1');
      store.delete('chromarift_mmo_state_v2');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB error
  }
}

export async function savePersistentMmoState(state: MmoState): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, STATE_RECORD_KEY);
      if (state.activePlayerId) {
        const pid = state.activePlayerId;
        const player = state.players.find((p) => p.id === pid);
        if (player) {
          const accountCards = state.cards.filter(
            (c) =>
              !c.isWild &&
              (c.ownerId === pid ||
                c.ownerHandle?.toLowerCase() === player.username.toLowerCase())
          );
          const accountPosts = state.posts.filter((p) => p.authorId === pid);
          store.put(
            {
              players: [player],
              cards: accountCards,
              posts: accountPosts,
            },
            `account_backup_${pid}`
          );
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage if IndexedDB fails
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage quota exceeded when IndexedDB is handling large photo decks
  }
}

export async function loadAccountBackup(playerId: string): Promise<Partial<MmoState> | null> {
  if (!playerId) return null;
  try {
    const db = await openIdb();
    return await new Promise<Partial<MmoState> | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`account_backup_${playerId}`);
      req.onsuccess = () => resolve((req.result as Partial<MmoState>) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function loadPersistentMmoState(): Promise<MmoState | null> {
  await purgeLegacyClientKeys();

  try {
    const db = await openIdb();
    const idbState = await new Promise<MmoState | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(STATE_RECORD_KEY);
      getReq.onsuccess = () => resolve((getReq.result as MmoState) || null);
      getReq.onerror = () => reject(getReq.error);
    });
    if (idbState && (idbState.cards?.length || idbState.players?.length)) {
      return idbState;
    }
  } catch {
    // Fall through to localStorage
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (raw) {
      return JSON.parse(raw) as MmoState;
    }
  } catch {
    // Ignore parse error
  }

  return null;
}

export function getSavedActivePlayerId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PLAYER_KEY);
  } catch {
    return null;
  }
}

export function setSavedActivePlayerId(playerId: string | null): void {
  try {
    if (playerId) {
      localStorage.setItem(ACTIVE_PLAYER_KEY, playerId);
    } else {
      localStorage.removeItem(ACTIVE_PLAYER_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

export function getSavedSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSavedSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage error
  }
}
