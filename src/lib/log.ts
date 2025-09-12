import { toast, ToastOptions } from 'react-toastify';

type DebugLevel = 0 | 1 | 2 | 3 | 4; // 0=quiet, 1=error, 2=warn, 3=info, 4=debug

function parseDebugLevel(): DebugLevel {
  try {
    if (typeof window === 'undefined') return 0;
    const raw = new URLSearchParams(window.location.search).get('debug') || '';
    if (!raw) return 0;
    const lower = raw.toLowerCase();
    if (['true', 'yes'].includes(lower)) return 2; // convenience: treat true as warn level
    if (lower === 'error' || lower === 'errors') return 1;
    if (lower === 'warn' || lower === 'warning' || lower === 'warnings') return 2;
    if (lower === 'info' || lower === 'infos') return 3;
    if (lower === 'debug' || lower === 'verbose') return 4;
    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (n <= 0) return 0;
      if (n === 1) return 1;
      if (n === 2) return 2;
      if (n === 3) return 3;
      return 4;
    }
    return 0;
  } catch { return 0; }
}

let cachedLevel: DebugLevel | null = null;
export function getDebugLevel(): DebugLevel {
  if (cachedLevel == null) cachedLevel = parseDebugLevel();
  return cachedLevel as DebugLevel;
}

function fmt(obj: unknown): string {
  try {
    if (obj == null) return '';
    if (obj instanceof Error) return obj.message;
    if (typeof obj === 'string') return obj;
    return JSON.stringify(obj);
  } catch { return String(obj); }
}

// Deduplicate identical toasts within this window
const TOAST_DEDUP_WINDOW_MS = 100;
// Track all messages seen within the window so different messages don't collide
const __toastSeen = new Map<string, number>();
function pushToast(message: string, options: ToastOptions): void {
  try {
    const now = Date.now();
    // purge stale entries
    for (const [m, t] of __toastSeen) { if (now - t > TOAST_DEDUP_WINDOW_MS) __toastSeen.delete(m); }
    const last = __toastSeen.get(message) || 0;
    if (now - last <= TOAST_DEDUP_WINDOW_MS) return;
    __toastSeen.set(message, now);
    toast(message, options);
  } catch { /* ignore toast errors */ }
}

export const log = {
  debug(msg: string, meta?: unknown): void {
    const level = getDebugLevel();
    if (level >= 4) {
      const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
      pushToast(text, { type: 'info', autoClose: 1600 });
    }
    const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
    try { if (level >= 4) console.debug(msg, meta); } catch { }
  },
  info(msg: string, meta?: unknown): void {
    const level = getDebugLevel();
    if (level >= 3) {
      const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
      pushToast(text, { type: 'info', autoClose: 1600 });
    }
    try { if (level >= 3) console.info(msg, meta); } catch { }
  },
  warn(msg: string, meta?: unknown): void {
    const level = getDebugLevel();
    if (level >= 2) {
      const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
      pushToast(text, { type: 'warning', autoClose: 2200 });
    }
    try { console.warn(msg, meta); } catch { }
  },
  error(msg: string, meta?: unknown): void {
    const level = getDebugLevel();
    if (level >= 1) {
      const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
      pushToast(text, { type: 'error', autoClose: 2600 });
    }
    try { console.error(msg, meta); } catch { }
  },
  // For notable UX milestones that should always toast regardless of debug level
  event(msg: string, options?: ToastOptions, meta?: unknown): void {
    const text = meta !== undefined ? `${msg} — ${fmt(meta)}` : msg;
    pushToast(text, { autoClose: 1600, type: 'info', ...options });
    try { console.info(msg, meta); } catch { }
  }
};
