// Atomic-ish versioned storage (spec 10.3): write temp -> swap -> keep one backup.
// Web/Android use localStorage (Capacitor WebView persists it); Electron routes through the preload bridge to real files.

export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

declare global {
  interface Window {
    cpNative?: {
      platform: 'electron';
      readFile(name: string): string | null;
      writeFileAtomic(name: string, data: string): void;
      removeFile(name: string): void;
      setFullscreen?(on: boolean): void;
      quit?(): void;
    };
  }
}

class LocalStorageBackend implements StorageBackend {
  read(key: string) { try { return localStorage.getItem('cp.' + key); } catch { return null; } }
  write(key: string, value: string) { try { localStorage.setItem('cp.' + key, value); } catch (e) { console.warn('save failed', e); } }
  remove(key: string) { try { localStorage.removeItem('cp.' + key); } catch { /* */ } }
}

class ElectronBackend implements StorageBackend {
  read(key: string) { return window.cpNative!.readFile(key + '.json'); }
  write(key: string, value: string) { window.cpNative!.writeFileAtomic(key + '.json', value); }
  remove(key: string) { window.cpNative!.removeFile(key + '.json'); }
}

export const backend: StorageBackend = typeof window !== 'undefined' && window.cpNative ? new ElectronBackend() : new LocalStorageBackend();

interface Envelope<T> { v: number; t: number; sum: number; data: T; }

function checksum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export type Migration = (data: any) => any;

/**
 * Save `data` under key with schema version. Writes key.tmp, then swaps: previous primary -> key.bak.
 */
export function saveVersioned<T>(key: string, version: number, data: T): void {
  const body = JSON.stringify(data);
  const env: Envelope<T> = { v: version, t: Date.now(), sum: checksum(body), data };
  const s = JSON.stringify(env);
  backend.write(key + '.tmp', s);
  const prev = backend.read(key);
  if (prev) backend.write(key + '.bak', prev);
  backend.write(key, s);
  backend.remove(key + '.tmp');
}

/**
 * Load with migrations. migrations[n] upgrades data from version n to n+1.
 * Falls back to .tmp (interrupted swap) then .bak if primary is corrupt.
 */
export function loadVersioned<T>(key: string, version: number, migrations: Record<number, Migration> = {}): T | null {
  for (const k of [key, key + '.tmp', key + '.bak']) {
    const raw = backend.read(k);
    if (!raw) continue;
    try {
      const env = JSON.parse(raw) as Envelope<T>;
      if (checksum(JSON.stringify(env.data)) !== env.sum) throw new Error('checksum');
      let data: any = env.data;
      for (let v = env.v; v < version; v++) {
        const m = migrations[v];
        if (m) data = m(data);
      }
      if (env.v > version) console.warn(`save ${k} is from a newer version (${env.v} > ${version})`);
      return data as T;
    } catch (e) {
      console.warn('corrupt save', k, e);
    }
  }
  return null;
}

export function removeSave(key: string): void {
  backend.remove(key);
  backend.remove(key + '.tmp');
  backend.remove(key + '.bak');
}
