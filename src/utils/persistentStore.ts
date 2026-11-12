import type { MmoState } from '../types.ts';

const DB_NAME = 'chromarift_persistent_db';
const DB_VERSION = 1;
const STORE_NAME = 'mmo_state_store';
const STATE_RECORD_KEY = 'chromarift_mmo_state_v2';
const LOCAL_STORAGE_FALLBACK_KEY = 'chromarift_mmo_state_cache_v2_nodemo';
const ACTIVE_PLAYER_KEY = 'chromarift_active_player_id_v1';

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

export async function savePersistentMmoState(state: MmoState): Promise<void> {
  // 1. Save to IndexedDB (500MB+ capacity, never hits 5MB localStorage quota on multi-photo uploads)
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, STATE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage if IndexedDB fails
  }

  // 2. Also save to localStorage when within quota
  try {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage quota exceeded when IndexedDB is handling large photo decks
  }
}

export async function loadPersistentMmoState(): Promise<MmoState | null> {
  // 1. Try IndexedDB first
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

  // 2. Fallback to localStorage
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
