import { useSyncExternalStore } from 'react';

export type BgFit = 'cover' | 'contain' | 'repeat';

export interface BackgroundSettings {
  brightness: number; // % độ sáng ảnh (0–200)
  contrast: number; // % độ tương phản (50–150)
  saturate: number; // % độ bão hoà màu (0–200)
  blur: number; // px làm mờ ảnh (0–40)
  opacity: number; // % độ mờ đục của ảnh (10–100)
  overlay: number; // % lớp phủ đen lên ảnh (0–90)
  cardOpacity: number; // % độ đặc của thẻ/panel (20–100)
  cardBlur: number; // px làm mờ phía sau thẻ (0–30)
  fit: BgFit;
  posX: number; // % vị trí ngang (0–100)
  posY: number; // % vị trí dọc (0–100)
}

export const DEFAULT_BG_SETTINGS: BackgroundSettings = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  opacity: 100,
  overlay: 30,
  cardOpacity: 70,
  cardBlur: 8,
  fit: 'cover',
  posX: 50,
  posY: 50,
};

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const LS_KEY = 'app_bg_settings';
const DB_NAME = 'app_background';
const STORE = 'kv';
const IMG_KEY = 'image';

/* ───────────── IndexedDB (lưu ảnh dạng Blob) ───────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRun<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/* ───────────── Store ngoài React (không cần Provider) ───────────── */

interface BgState {
  settings: BackgroundSettings;
  imageUrl: string | null;
}

function loadSettings(): BackgroundSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_BG_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Lỗi đọc cài đặt hình nền:', e);
  }
  return { ...DEFAULT_BG_SETTINGS };
}

let state: BgState = { settings: loadSettings(), imageUrl: null };
const listeners = new Set<() => void>();

function syncCssVars() {
  const root = document.documentElement;
  if (state.imageUrl) {
    root.style.setProperty('--card-opacity', String(state.settings.cardOpacity / 100));
    root.style.setProperty('--card-blur', `${state.settings.cardBlur}px`);
  } else {
    // Không có ảnh: thẻ trở về nền đặc như cũ
    root.style.removeProperty('--card-opacity');
    root.style.removeProperty('--card-blur');
  }
}

function commit(patch: Partial<BgState>) {
  state = { ...state, ...patch };
  syncCssVars();
  listeners.forEach((l) => l());
}

function persistSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.error('Lỗi lưu cài đặt hình nền:', e);
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useBackground(): BgState {
  return useSyncExternalStore(subscribe, () => state);
}

export function updateBackground(patch: Partial<BackgroundSettings>) {
  commit({ settings: { ...state.settings, ...patch } });
  persistSettings();
}

export function resetBackgroundSettings() {
  commit({ settings: { ...DEFAULT_BG_SETTINGS } });
  persistSettings();
}

export async function setBackgroundImage(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Tệp được chọn không phải hình ảnh.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Ảnh quá lớn (tối đa ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`);
  }
  await idbRun('readwrite', (s) => s.put(file, IMG_KEY));
  const old = state.imageUrl;
  commit({ imageUrl: URL.createObjectURL(file) });
  if (old) URL.revokeObjectURL(old);
}

export async function clearBackgroundImage(): Promise<void> {
  await idbRun('readwrite', (s) => s.delete(IMG_KEY));
  const old = state.imageUrl;
  commit({ imageUrl: null });
  if (old) URL.revokeObjectURL(old);
}

/* Nạp ảnh đã lưu khi khởi động */
if (typeof indexedDB !== 'undefined') {
  idbRun<Blob | undefined>('readonly', (s) => s.get(IMG_KEY))
    .then((blob) => {
      if (blob) commit({ imageUrl: URL.createObjectURL(blob) });
    })
    .catch((e) => console.error('Lỗi nạp hình nền:', e));
}
