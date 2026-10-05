// Chord symbols, voicings and voice leading for the generative-from-data score.

export interface Chord {
  sym: string;
  root: number;      // pitch class 0..11
  bass: number;      // pitch class of the bass note (slash chords)
  iv: number[];      // intervals above root (sorted, may exceed 12 for tensions)
}

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], '5': [0, 7], aug: [0, 4, 8], dim: [0, 3, 6],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '69': [0, 4, 7, 9, 14], m69: [0, 3, 7, 9, 14],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  '11': [0, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], '13': [0, 4, 7, 10, 14, 21], maj13: [0, 4, 7, 11, 14, 21], m13: [0, 3, 7, 10, 14, 21],
  sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7], '7sus4': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14], '13sus4': [0, 5, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '7#11': [0, 4, 7, 10, 18], 'maj7#11': [0, 4, 7, 11, 18], 'maj9#11': [0, 4, 7, 11, 14, 18],
  '7b13': [0, 4, 7, 10, 20], '7alt': [0, 4, 10, 13, 15, 20], m7b9: [0, 3, 7, 10, 13], '7b5': [0, 4, 6, 10],
};

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parsePc(s: string): [number, number] {
  let pc = PC[s[0]];
  let n = 1;
  if (s[1] === '#') { pc++; n++; } else if (s[1] === 'b') { pc--; n++; }
  return [(pc + 12) % 12, n];
}

const chordCache = new Map<string, Chord>();
export function parseChord(sym: string): Chord {
  const have = chordCache.get(sym);
  if (have) return have;
  const [main, slash] = sym.split('/');
  const [root, n] = parsePc(main);
  const q = main.slice(n);
  const iv = QUAL[q];
  if (!iv) throw new Error(`Unknown chord quality '${q}' in '${sym}'`);
  const c: Chord = { sym, root, bass: slash ? parsePc(slash)[0] : root, iv: iv.slice() };
  chordCache.set(sym, c);
  return c;
}

export function transposeChord(c: Chord, semis: number): Chord {
  if (!semis) return c;
  return { sym: c.sym + '+' + semis, root: (c.root + semis + 120) % 12, bass: (c.bass + semis + 120) % 12, iv: c.iv };
}

/** Pitch-class degree resolver used by chord-relative bass lines. */
export function degree(c: Chord, d: string): number {
  const has = (x: number) => c.iv.some((i) => i % 12 === x);
  switch (d) {
    case 'R': case 'r': return c.bass === c.root ? 0 : (c.bass - c.root + 12) % 12;
    case 'T': return 0; // true root even over a slash bass
    case '3': return has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : 2;
    case '5': case 'L': return has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    case '7': case 'b': return has(10) ? 10 : has(11) ? 11 : has(9) ? 9 : 10;
    case '2': return 14;
    case '4': return 5;
    case '6': return 9;
    case 'O': case 'o': return 12;
    case 'm': return has(3) ? 3 : 4; // minor-ish third fallback
    default: return 0;
  }
}

/** Choose `voices` chord tones (dropping 5th then root for rich chords) as pitch classes relative to root. */
function pickTones(c: Chord, voices: number, rootless: boolean): number[] {
  let t = c.iv.map((i) => i % 12);
  t = t.filter((v, i) => t.indexOf(v) === i);
  if (rootless && t.length > 3) t = t.filter((v) => v !== 0);
  while (t.length > voices) {
    if (t.includes(7) && t.length > 3) t = t.filter((v) => v !== 7);
    else if (t.includes(0) && t.length > 3) t = t.filter((v) => v !== 0);
    else t.pop();
  }
  return t;
}

/**
 * Close-position voicing near `center` (MIDI), voice-led from `prev` when given.
 * Returns ascending MIDI notes.
 */
export function voice(c: Chord, voices: number, center: number, prev?: number[], rootless = false, spread = false): number[] {
  const tones = pickTones(c, voices, rootless).map((x) => (x + c.root) % 12);
  let best: number[] = [], bestScore = Infinity;
  for (let inv = 0; inv < tones.length; inv++) {
    const order = tones.slice(inv).concat(tones.slice(0, inv));
    for (let base = center - 14; base <= center + 2; base++) {
      if ((base % 12 + 12) % 12 !== order[0]) continue;
      const v: number[] = [base];
      for (let i = 1; i < order.length; i++) {
        let n = v[i - 1] + 1;
        while ((n % 12 + 12) % 12 !== order[i]) n++;
        v.push(n);
      }
      if (spread && v.length >= 4) { v[v.length - 2] -= 12; v.sort((a, b) => a - b); }
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      let score = Math.abs(mean - center) * 0.6;
      if (prev && prev.length) {
        for (const n of v) { let d = 99; for (const q of prev) d = Math.min(d, Math.abs(n - q)); score += d; }
      }
      if (v[v.length - 1] > center + 12) score += 4;
      if (score < bestScore) { bestScore = score; best = v; }
    }
  }
  return best;
}

/** Bass MIDI note for a pitch class, placed in the octave starting at `low`. */
export function bassNote(pc: number, low: number): number {
  let n = low;
  while ((n % 12 + 12) % 12 !== ((pc % 12) + 12) % 12) n++;
  return n;
}
