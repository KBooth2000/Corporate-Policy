// Act themes: each has ONE composition (shared key, tempo, progression, melody) in two arrangements that layer:
//   on:'x' = exploration muzak, on:'c' = combat house/techno, unmarked = shared.
// Notation: see sequencer.ts. Steps are 16ths; bars are 16 steps. All melodies are original.
import type { TrackDef, PartDef } from '../sequencer';

// Common combat furniture --------------------------------------------------------------------------
const crashEvery8 = (v = 0.32): PartDef => ({ i: 'crash', k: 'd', on: 'c', p: 'x...............', o: 'A _*7', v, pan: -0.2, s: 'fx' });
const riserInto = (v = 0.7): PartDef => ({ i: 'riser', k: 'd', on: 'c', p: 'x---------------', o: '_*15 A', v, s: 'fx', x: { g: 0.12 } });

// ==================================================================================================
// ACT 1 — Lobby Bossa (Fresh Starters) <-> Ground Floor Deep House. F major, 122 bpm.
export const ACT1_PROG =
  'Gm9 | C13 | Fmaj9 | Dm9 | Gm9 | C7b9 | Am7 , D7b9 | Gm9 , C13 | Bbmaj7 | Am7 | Gm7 | C9sus4 , C7b9 | Fmaj7 | D7#9 | Gm9 | C9sus4 , C13';
export const ACT1_MEL_A =
  'r:2 d5:2 f5:2 a5:6 g5:2 f5:2 | e5:6 g5:2 a5:4 g5:4 | e5:10 c5:2 d5:2 e5:2 | f5:4 e5:2 d5:2 a4:8 | ' +
  'r:2 bb4:2 d5:2 f5:2 a5:4 bb5:4 | a5:2 g5:6 e5:4 db5:4 | c5:4 e5:4 f#5:4 eb5:4 | d5:6 f5:2 e5:4 r:4 | ' +
  'f5:2 a5:4 c6:2 a5:8 | g5:4 e5:2 c5:2 e5:8 | f5:2 d5:4 bb4:2 d5:4 f5:4 | g5:8 e5:4 db5:4 | ' +
  'c5:6 a4:2 c5:2 e5:6 | f5:4 f#5:2 a5:2 c6:8 | bb5:4 a5:4 g5:4 f5:4 | g5:12 r:4 |';
export const ACT1_MEL_B =
  'r:4 a5:2 bb5:2 c6:2 d6:6 | c6:4 a5:4 g5:4 e5:4 | f5:2 e5:2 f5:2 g5:2 a5:8 | r:4 c6:4 a5:4 f5:4 | ' +
  'g5:6 bb5:2 a5:4 f5:4 | e5:4 g5:2 bb5:2 db6:4 c6:4 | a5:4 g5:4 f#5:4 a5:4 | bb5:6 a5:2 g5:8 | ' +
  'd6:6 c6:2 a5:8 | g5:2 a5:2 c6:4 e6:8 | d6:4 bb5:4 g5:4 f5:4 | f5:4 g5:4 bb5:4 db6:4 | ' +
  'c6:2 a5:14 | r:2 a5:2 c6:4 f#5:8 | a5:4 bb5:4 d6:4 c6:4 | bb5:6 a5:2 g5:8 |';

export const ACT1: TrackDef = {
  id: 'act1', title: 'Lobby Bossa (Fresh Starters)', combatTitle: 'Ground Floor Deep House',
  bpm: 122, key: 'F major', desc: 'Bossa-nova lobby muzak (nylon guitar, flute, vibes, upright) that drops into warm deep house (Rhodes stabs, vocal chops, deep bass).',
  prog: ACT1_PROG, rv: { size: 2.0, damp: 0.55 }, delay: { beats: 0.75, fb: 0.38 }, rageLow: 29,
  parts: [
    // ---- exploration: bossa muzak
    { i: 'flute', k: 'm', on: 'x', p: { A: ACT1_MEL_A }, o: 'A _*16', v: 0.9, rv: 0.3, dl: 0.1, hum: 0.5 },
    { i: 'vibes', k: 'm', on: 'x', p: { B: ACT1_MEL_B }, o: '_*16 B', v: 0.95, rv: 0.3, hum: 0.4, tr: -12 },
    { i: 'nylon', k: 'c', on: 'x', p: { A: 'x--x--x---x-x--- --x---x---x--x--', F: 'x--x--x---x-x--- x-x-x-x-x---x---' }, o: 'AAAAAAAF', voices: 4, oct: 59, v: 0.9, rv: 0.18, hum: 0.6, x: { strum: 0.011 }, pan: -0.15 },
    { i: 'upright', k: 'b', on: 'x', p: { A: 'R-----5-R-----5-', B: 'R-----5-R-----A-' }, o: 'AAAB', oct: 29, v: 1 },
    { i: 'shaker', k: 'd', on: 'x', p: 'xgogxgogxgogxgog', v: 0.5, pan: 0.35, hum: 0.6 },
    { i: 'rim', k: 'd', on: 'x', p: 'x..x..x...x..x.. ..x..x....x..x..', v: 0.42, pan: -0.25, hum: 0.4 },
    { i: 'kick', k: 'd', on: 'x', p: 'x.....o.x.....o.', v: 0.55, x: { f: 56, dec: 0.22, click: 0.08, punch: 2.2 } },
    { i: 'strings', k: 'c', on: 'x', p: 'x---------------', o: '_*16 A*16', voices: 4, oct: 64, v: 0.5, rv: 0.4, x: { att: 0.6, cut: 2200 } },
    { i: 'brush', k: 'd', on: 'x', p: '....x.......x...', o: '_*16 A*16', v: 0.5, x: { att: 0.03, dec: 0.18 } },
    // ---- combat: deep house
    { i: 'kick', k: 'd', on: 'c', p: { A: 'X...x...X...x...', F: 'X...x...X...x.xo' }, o: 'AAAAAAAF', v: 1, x: { f: 50, dec: 0.42, click: 0.35 } },
    { i: 'clap', k: 'd', on: 'c', p: { A: '....x.......x...', B: '....x.......x..g' }, o: 'AAAB', v: 0.55, rv: 0.25 },
    { i: 'hat', k: 'd', on: 'c', p: '..x...x...x...x.', v: 0.5, pan: 0.15, x: { dec: 0.2, f: 6800 } },
    { i: 'hat', k: 'd', on: 'c', p: 'g.ggg.ggg.ggg.gx', v: 0.7, pan: -0.15, hum: 0.5 },
    { i: 'conga', k: 'd', on: 'c', p: '...x..x....x.x.. ..x...x.x....x..', v: 0.42, pan: -0.4, x: { f: 230 }, hum: 0.5 },
    { i: 'conga', k: 'd', on: 'c', p: '.......x.......x', o: '_*8 A*24', v: 0.55, pan: 0.4, x: { f: 165 } },
    { i: 'deep', k: 'b', on: 'c', p: { A: 'R-.R..R-..R..5-.', B: 'R-.R..R-..R.O-A-' }, o: 'AAAB', oct: 29, v: 0.95, x: { cut: 380 } },
    { i: 'rhodes', k: 'c', on: 'c', p: { A: '..x-..x-...x-...', B: '..x-..x-..x-.x-.' }, o: 'AAAB', voices: 4, oct: 63, v: 0.8, rv: 0.2, dl: 0.25, x: { cut: 2600, idx: 1.3 } },
    { i: 'pad', k: 'c', on: 'c', p: 'x---------------', voices: 4, oct: 60, v: 0.45, x: { cut: 900, att: 0.5 }, rv: 0.3 },
    { i: 'vox', k: 'a', on: 'c', p: { A: '..3..2.4..3...1.', B: '..3..2.4..5..4..' }, o: '_*8 A A A B _*8 A A A B', voices: 3, oct: 72, v: 0.75, dl: 0.3, rv: 0.25 },
    { i: 'pluck', k: 'm', on: 'c', p: { A: ACT1_MEL_A }, o: '_*16 A', v: 0.55, dl: 0.32, rv: 0.2, x: { cut: 2400, dec: 0.3 }, tr: -12 },
    crashEvery8(), riserInto(),
    { i: 'snare', k: 'd', on: 'c', p: '........o.o.xxXX', o: '_*15 A', v: 0.4, rv: 0.2 },
  ],
};

// ==================================================================================================
// ACT 2 — Smooth Pipeline Jazz <-> Quarter-End Tech House. Eb major, 124 bpm.
const ACT2_PROG =
  'Abmaj9 | Gm7 | Fm9 | Bb9sus4 | Ebmaj9 | Cm9 | Fm9 | Bb13 | Abmaj9 | Gm7 , C7#9 | Fm9 | Bb9sus4 | Gm7 | C7b9 | Fm9 , Bb9sus4 | Ebmaj9';
export const ACT2_MEL_A =
  'r:2 eb5:2 f5:2 g5:2 bb5:6 g5:2 | f5:4 d5:2 bb4:2 d5:8 | r:2 c5:2 eb5:2 f5:2 g5:4 ab5:2 g5:2 | f5:12 eb5:2 f5:2 | ' +
  'g5:6 bb5:2 d6:4 c6:2 bb5:2 | g5:8 r:2 eb5:2 f5:2 g5:2 | ab5:4 g5:2 f5:2 eb5:4 c5:4 | d5:2 f5:2 g5:8 r:4 | ' +
  'c6:6 bb5:2 g5:4 eb5:4 | f5:4 d5:4 eb5:4 e5:4 | f5:2 ab5:2 c6:4 bb5:2 ab5:2 g5:4 | f5:16 | ' +
  'r:2 d5:2 f5:2 g5:2 bb5:8 | bb5:4 g5:2 e5:2 db6:8 | c6:4 ab5:4 g5:4 f5:4 | g5:2 f5:2 eb5:12 |';
const ACT2_MEL_B =
  'r:4 g5:2 ab5:2 bb5:2 c6:2 eb6:4 | d6:4 bb5:4 f5:8 | g5:2 ab5:2 g5:2 f5:2 eb5:2 c5:2 eb5:4 | f5:8 r:4 bb4:2 c5:2 | ' +
  'd5:4 eb5:2 f5:2 g5:8 | bb5:4 g5:2 eb5:2 d5:4 c5:4 | eb5:2 f5:2 ab5:2 c6:2 eb6:8 | d6:4 c6:4 bb5:4 g5:4 | ' +
  'bb5:8 c6:4 bb5:4 | f5:6 d5:2 e5:4 g5:4 | ab5:8 g5:4 f5:4 | eb5:4 f5:4 ab5:4 c6:4 | ' +
  'bb5:12 d6:4 | db6:4 bb5:4 g5:4 e5:4 | f5:8 ab5:4 bb5:4 | g5:16 |';

export const ACT2: TrackDef = {
  id: 'act2', title: 'Smooth Pipeline Jazz', combatTitle: 'Quarter-End Tech House',
  bpm: 124, swing: 0.1, key: 'Eb major', desc: 'Smooth-jazz soprano sax over Rhodes and fretless bass; drops into rolling tech house with FM bass, shuffled hats and a filtered sax hook.',
  prog: ACT2_PROG, rv: { size: 2.4, damp: 0.5 }, delay: { beats: 0.75, fb: 0.4 }, rageLow: 27,
  parts: [
    // ---- exploration: smooth jazz
    { i: 'sax', k: 'm', on: 'x', p: { A: ACT2_MEL_A, B: ACT2_MEL_B }, o: 'AB', v: 0.85, rv: 0.35, dl: 0.12, hum: 0.5 },
    { i: 'rhodes', k: 'c', on: 'x', p: { A: 'x-----x---x----- --x-----x-----x-', B: '..x-..x---x...x- x-..x-....x-x---' }, o: 'A*8 B*8', voices: 4, oct: 60, rootless: true, v: 0.85, rv: 0.25, hum: 0.6, pan: 0.15 },
    { i: 'fretless', k: 'b', on: 'x', p: { A: 'R-----R-..5-R-.A', B: 'R---.R--5---.R-A' }, o: 'AAAB', oct: 27, v: 0.95 },
    { i: 'kick', k: 'd', on: 'x', p: 'x.....x.x....... x.....x.x.....x.', v: 0.6, x: { f: 55, dec: 0.28, click: 0.12, punch: 2.5 } },
    { i: 'rim', k: 'd', on: 'x', p: '....x.......x...', o: 'A*16 _*16', v: 0.5, rv: 0.15 },
    { i: 'snare', k: 'd', on: 'x', p: '....x.......x..g', o: '_*16 A*16', v: 0.4, rv: 0.2, x: { dec: 0.13, nf: 2000 } },
    { i: 'hat', k: 'd', on: 'x', p: 'xgogxgogxgogxgog', v: 0.42, pan: 0.25, hum: 0.6, x: { dec: 0.035 } },
    { i: 'tamb', k: 'd', on: 'x', p: '....x.......x...', o: '_*16 A*16', v: 0.4, pan: -0.3 },
    { i: 'strings', k: 'c', on: 'x', p: 'x---------------', o: '_*16 A*16', voices: 4, oct: 65, v: 0.45, rv: 0.4, x: { att: 0.5 } },
    // ---- combat: tech house
    { i: 'kick', k: 'd', on: 'c', p: { A: 'X...X...X...X...', F: 'X...X...X...X.X.' }, o: 'AAAAAAAF', v: 1, x: { f: 52, dec: 0.32, click: 0.5, punch: 4 } },
    { i: 'clap', k: 'd', on: 'c', p: '....x.......x...', v: 0.5, rv: 0.2 },
    { i: 'snare', k: 'd', on: 'c', p: '....x.......x...', v: 0.25, x: { dec: 0.1 } },
    { i: 'hat', k: 'd', on: 'c', p: '..x...x...x...x.', v: 0.5, x: { dec: 0.12, f: 7000 } },
    { i: 'hat', k: 'd', on: 'c', p: 'xg.gxg.gxg.gxg.x', v: 0.4, pan: 0.3, hum: 0.4 },
    { i: 'rim', k: 'd', on: 'c', p: '...x..x....x..x. ..x..x...x....x.', v: 0.38, pan: -0.35, dl: 0.2 },
    { i: 'shaker', k: 'd', on: 'c', p: 'gxgxgxgxgxgxgxgx', o: '_*8 A*24', v: 0.35, pan: 0.45 },
    { i: 'fmbass', k: 'b', on: 'c', p: { A: 'R.rR..rR.rR..Or.', B: 'R.rR..rR.rR.O.A.' }, o: 'AAAB', oct: 27, v: 0.95, x: { idx: 2.4, dec: 0.12, s: 0.5 } },
    { i: 'stab', k: 'c', on: 'c', p: { A: '...x-.....x-....', B: '...x-.....x-..x.' }, o: 'AAAB', voices: 3, oct: 63, v: 0.7, dl: 0.35, rv: 0.15, x: { cut: 1300 } },
    { i: 'sax', k: 'm', on: 'c', p: { A: ACT2_MEL_A }, o: '_*16 A', v: 0.6, dl: 0.3, rv: 0.25 },
    { i: 'organ', k: 'c', on: 'c', p: '..x-..x-..x-..x-', o: '_*8 A*8 _*8 A*8', voices: 3, oct: 64, v: 0.45, x: { reg: 'thin', cut: 3500 } },
    crashEvery8(), riserInto(),
    { i: 'clap', k: 'd', on: 'c', p: '........x.x.xxxx', o: '_*15 A', v: 0.4 },
  ],
};

// ==================================================================================================
// ACT 3 — Your Call Is Important To Us <-> Minimal Compliance. A minor, 126 bpm.
// Original baroque-idiom hold music (harpsichord, strings, pizzicato) through a band-limited phone line.
const ACT3_PROG = 'Am | Dm/F | G7 | C | F | Bm7b5 | E7 | Am | C | F | Dm | E | Am/C | Dm , E7 | Am , F | E7';
export const ACT3_MEL =
  'e5:4 a5:4 c6:2 b5:2 a5:4 | d5:4 f5:4 a5:2 g5:2 f5:4 | g5:2 f5:2 e5:2 d5:2 b4:4 d5:4 | c5:4 e5:4 g5:2 f5:2 e5:4 | ' +
  'a5:4 c6:2 a5:2 f5:4 a5:4 | d5:2 f5:2 a5:2 f5:2 b4:4 d5:4 | e5:2 g#5:2 b5:2 g#5:2 e5:4 d5:4 | c5:4 b4:4 a4:8 | ' +
  'e5:2 g5:2 c6:4 b5:2 c6:2 g5:4 | a5:2 g5:2 f5:2 e5:2 f5:4 c5:4 | d5:2 e5:2 f5:2 g5:2 a5:4 f5:4 | g#5:4 e5:4 b4:4 e5:4 | ' +
  'a5:4 e5:2 c5:2 e5:4 a5:4 | f5:4 d5:4 b4:4 g#5:4 | a5:2 c6:2 b5:2 a5:2 a5:2 g5:2 f5:2 e5:2 | e5:4 d5:2 c5:2 b4:8 |';

export const ACT3: TrackDef = {
  id: 'act3', title: 'Your Call Is Important To Us', combatTitle: 'Minimal Compliance',
  bpm: 126, key: 'A minor', desc: 'Original baroque hold music (harpsichord, strings, pizzicato) squeezed through a 350 Hz–3.2 kHz phone line; drops into minimal techno with bleeps, dub stabs and the harpsichord figure.',
  prog: ACT3_PROG, exploreFx: 'phone', rv: { size: 1.8, damp: 0.6 }, delay: { beats: 0.75, fb: 0.45 }, rageLow: 33,
  parts: [
    // ---- exploration: hold music
    { i: 'harpsi', k: 'm', on: 'x', p: { A: ACT3_MEL }, o: 'A _*16', v: 1, rv: 0.12 },
    { i: 'strings', k: 'm', on: 'x', p: { A: ACT3_MEL }, o: '_*16 A', v: 0.45, rv: 0.2, x: { att: 0.06, rel: 0.25, cut: 3000 } },
    { i: 'harpsi', k: 'a', on: 'x', p: '0121312101213121', o: '_*16 A*16', voices: 3, oct: 57, v: 0.35 },
    { i: 'strings', k: 'c', on: 'x', p: 'x-------x-------', o: 'A*16 _*16', voices: 4, oct: 58, v: 0.45, x: { att: 0.15, rel: 0.4 } },
    { i: 'pizz', k: 'b', on: 'x', p: { A: 'R...5...R...5...', B: 'R...3...5...O...' }, o: 'AAAB', oct: 33, v: 1.4 },
    { i: 'beep', k: 'm', on: 'x', p: { A: 'r:12 a5:2 r:2' }, o: '_*15 A', v: 0.8 },
    // ---- combat: minimal techno
    { i: 'kick', k: 'd', on: 'c', p: { A: 'X...X...X...X...', F: 'X...X...X...X..x' }, o: 'AAAAAAAF', v: 1, x: { f: 48, dec: 0.3, click: 0.6, punch: 4.5 } },
    { i: 'hat', k: 'd', on: 'c', p: '..x...x...x...x.', v: 0.42, x: { dec: 0.05 } },
    { i: 'tick', k: 'd', on: 'c', p: 'x..x..x..x..x.x.', v: 0.45, pan: 0.5 },
    { i: 'rim', k: 'd', on: 'c', p: '......x.....x... ......x.......x.', v: 0.6, pan: -0.3, dl: 0.45 },
    { i: 'clap', k: 'd', on: 'c', p: '............x...', o: '_*4 A*28', v: 0.7, rv: 0.4 },
    { i: 'sub', k: 'b', on: 'c', p: { A: '..R-..R-..R-..R-', B: '..R-..R-..R-.RO-' }, o: 'AAAB', oct: 33, v: 0.95 },
    { i: 'blip', k: 'a', on: 'c', p: { A: '0..1..2..1..0.2.', B: '2..1..0..3..1...' }, o: 'AB', voices: 3, oct: 74, v: 0.55, dl: 0.45, pan: 0.2 },
    { i: 'stab', k: 'c', on: 'c', p: '...x............ ..........x.....', voices: 3, oct: 60, v: 0.65, dl: 0.55, rv: 0.3, x: { cut: 700, q: 4, dec: 0.25 } },
    { i: 'harpsi', k: 'm', on: 'c', p: { A: ACT3_MEL }, o: '_*16 A', v: 1.2, dl: 0.25 },
    { i: 'harpsi', k: 'a', on: 'c', p: '0121312101213121', o: '_*8 A*8 _*16', voices: 3, oct: 57, v: 0.4, dl: 0.2 },
    crashEvery8(0.25), riserInto(0.6),
  ],
};

// ==================================================================================================
// ACT 4 — We Are One Family (Anthem) <-> Hard Techno Board Meeting. D major, 140 bpm (anthem in half-time feel).
export const ANTHEM_PROG = 'D | A/C# | Bm | G | D/F# | G | Em7 | A | G | A | F#m7 | Bm | G | D/F# | Em7 | Asus4 , A';
export const ANTHEM_MEL =
  'f#5:8 e5:4 d5:4 | e5:8 a4:8 | d5:6 c#5:2 b4:4 d5:4 | b4:12 r:4 | a5:8 f#5:4 a5:4 | b5:8 a5:4 g5:4 | g5:6 f#5:2 e5:4 d5:4 | e5:16 | ' +
  'd5:4 e5:4 g5:8 | e5:4 f#5:4 a5:8 | c#6:8 a5:4 f#5:4 | d6:12 c#6:2 b5:2 | b5:8 a5:4 g5:4 | a5:8 f#5:8 | g5:4 f#5:4 e5:4 d5:4 | e5:6 d5:2 c#5:8 |';

export const ACT4: TrackDef = {
  id: 'act4', title: 'We Are One Family (Anthem)', combatTitle: 'Hard Techno Board Meeting',
  bpm: 140, key: 'D major', desc: 'Pompous corporate anthem (piano, strings, glockenspiel, choir, timpani, big-reverb claps) that turns into distorted hard techno with rumble kick, acid and the anthem on supersaws.',
  prog: ANTHEM_PROG, rv: { size: 3.0, damp: 0.45 }, delay: { beats: 0.75, fb: 0.3 }, rageLow: 33,
  parts: [
    // ---- exploration: corporate anthem
    { i: 'piano', k: 'c', on: 'x', p: 'x---x---x---x---', voices: 4, oct: 62, v: 0.7, rv: 0.3, hum: 0.4 },
    { i: 'strings', k: 'b', on: 'x', p: 'R---------------', oct: 38, v: 1.6, x: { att: 0.08 } },
    { i: 'strings', k: 'c', on: 'x', p: 'x---------------', voices: 4, oct: 66, v: 0.55, rv: 0.4 },
    { i: 'piano', k: 'm', on: 'x', p: { A: ANTHEM_MEL }, o: 'A _*16', v: 0.85, rv: 0.35 },
    { i: 'glock', k: 'm', on: 'x', p: { A: ANTHEM_MEL }, o: 'A A', v: 0.6, rv: 0.4, tr: 12 },
    { i: 'choir', k: 'm', on: 'x', p: { A: ANTHEM_MEL }, o: '_*16 A', v: 1.1, rv: 0.45, x: { v: 'o', att: 0.12 } },
    { i: 'brass', k: 'm', on: 'x', p: { A: ANTHEM_MEL }, o: '_*16 A', v: 1.2, rv: 0.3, tr: -12 },
    { i: 'choir', k: 'c', on: 'x', p: 'x---------------', o: '_*16 A*16', voices: 3, oct: 64, v: 0.55, rv: 0.5 },
    { i: 'timpani', k: 'b', on: 'x', p: { A: 'R...............', F: 'R.......R.R.RRRR' }, o: 'A___A___A___A__F', oct: 38, v: 1.4 },
    { i: 'kick', k: 'd', on: 'x', p: 'X.........x.....', v: 0.7, x: { f: 52, dec: 0.4, click: 0.2 } },
    { i: 'clap', k: 'd', on: 'x', p: '........X.......', v: 0.5, rv: 0.6 },
    { i: 'shaker', k: 'd', on: 'x', p: 'x.g.x.g.x.g.x.g.', o: '_*8 A*24', v: 0.45, pan: 0.3 },
    { i: 'crash', k: 'd', on: 'x', p: 'x...............', o: 'A _*7', v: 0.25 },
    // ---- combat: hard techno
    { i: 'kick', k: 'd', on: 'c', p: { A: 'X...X...X...X...', F: 'X...X...X...X.XX' }, o: 'AAAAAAAF', v: 0.95, x: { f: 50, dec: 0.42, drive: 3.5, punch: 4.5, click: 0.7, post: 0.6 } },
    { i: 'rumble', k: 'b', on: 'c', p: '.R--.R--.R--.R--', oct: 26, v: 0.8 },
    { i: 'hat', k: 'd', on: 'c', p: 'gxXxgxXxgxXxgxXx', v: 0.36, pan: 0.2 },
    { i: 'hat', k: 'd', on: 'c', p: '..x...x...x...x.', v: 0.42, pan: -0.2, x: { dec: 0.15 } },
    { i: 'clap', k: 'd', on: 'c', p: '....x.......x...', v: 0.5, rv: 0.3 },
    { i: 'acid', k: 'b', on: 'c', p: { A: 'R.RO.Rb.R.5O.RbO', B: 'R.RO.Rb.ROR5O.RA' }, o: 'A*12 B*4', oct: 38, v: 0.55, x: { cut: 480, q: 14, drive: 3 }, dl: 0.15 },
    { i: 'supersaw', k: 'c', on: 'c', p: 'x-.x-.x-..x-.x-.', o: '_*8 A*24', voices: 4, oct: 64, v: 0.6, dl: 0.2, x: { pluck: 0.22, cut: 4200, s: 0.3 } },
    { i: 'supersaw', k: 'm', on: 'c', p: { A: ANTHEM_MEL }, o: '_*16 A', v: 0.8, rv: 0.25, x: { n: 5, cut: 6000 } },
    crashEvery8(0.35), riserInto(0.8),
    { i: 'snare', k: 'd', on: 'c', p: 'x.x.x.x.xxxxXXXX', o: '_*15 A', v: 0.42 },
  ],
};
