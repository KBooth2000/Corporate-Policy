// Menu, hub, shop, lift, event, daily and credits tracks (single arrangement each).
import type { TrackDef } from '../sequencer';
import { ACT1_PROG, ACT1_MEL_A, ACT1_MEL_B } from './acts';

// CorpOS login ambience. C lydian, 90 bpm.
export const MENU: TrackDef = {
  id: 'menu', title: 'CorpOS Login Chime (Extended Mix)', bpm: 90, key: 'C lydian',
  desc: 'Glassy corporate-OS ambience: slow pads, a four-note login chime on glockenspiel/vibes, soft sub and ticking beat that enters on the second pass.',
  prog: 'Cmaj9 | Cmaj9 | Am9 | Am9 | Fmaj7#11 | Fmaj7#11 | G9sus4 | G9sus4',
  rv: { size: 3.6, damp: 0.35, wet: 0.45 }, delay: { beats: 0.75, fb: 0.45, wet: 0.45 }, noRage: true,
  parts: [
    { i: 'pad', k: 'c', p: 'x-------------------------------', voices: 4, oct: 62, v: 0.45, rv: 0.5, x: { att: 1.5, rel: 2, cut: 1600, sweep: 0.1 } },
    { i: 'glock', k: 'm', p: { A: 'r:8 e5:2 g5:2 d6:4 | c6:16 | r:8 c5:2 e5:2 b5:4 | a5:16 | r:8 a4:2 c5:2 g5:4 | e5:8 b4:8 | r:8 d5:2 f5:2 c6:4 | a5:16 |' }, v: 0.7, rv: 0.5, dl: 0.4, tr: 12 },
    { i: 'vibes', k: 'a', p: '0...2...1...3...', o: '_*8 A*8', voices: 4, oct: 67, v: 0.55, dl: 0.35, rv: 0.4 },
    { i: 'sub', k: 'b', p: 'R---------------', o: '_*8 A*8', oct: 36, v: 0.6, x: { s: 0.9 } },
    { i: 'tick', k: 'd', p: 'x...x...x...x...', o: '_*8 A*8', v: 0.35, pan: 0.4, dl: 0.3 },
    { i: 'kick', k: 'd', p: 'x.........x.....', o: '_*8 A*8', v: 0.7, x: { f: 54, dec: 0.3, click: 0.05, punch: 2 } },
    { i: 'shaker', k: 'd', p: '..g...g...g...g.', o: '_*8 A*8', v: 1.0, pan: -0.4 },
  ],
};

// Car park hub. Lo-fi hip-hop, F minor, 82 bpm, swung.
export const HUB: TrackDef = {
  id: 'hub', title: 'Car Park Contemplation', bpm: 82, swing: 0.28, key: 'F minor', fx: 'lofi',
  desc: 'Reflective lo-fi: dusty swung drums, Rhodes chords, sub bass, vinyl crackle and a sparse vibraphone line every other pass.',
  prog: 'Dbmaj9 | Cm7 | Fm9 | Fm9 | Bbm9 | Eb9sus4 | Abmaj9 | C7#9',
  rv: { size: 1.8, damp: 0.6 }, delay: { beats: 0.75, fb: 0.35 }, noRage: true,
  parts: [
    { i: 'rhodes', k: 'c', p: 'x---------x----- x-------x-.x----', voices: 4, oct: 60, rootless: true, v: 0.9, rv: 0.2, hum: 0.8, x: { cut: 2400, idx: 1.1 } },
    { i: 'kick', k: 'd', p: 'x......x..x..... x.......x.x.....', v: 0.5, hum: 0.4, x: { f: 52, dec: 0.3, click: 0.15, punch: 2.6 } },
    { i: 'snare', k: 'd', p: '....x.......x... ....x.......x..g', v: 0.55, hum: 0.5, x: { dec: 0.12, nf: 1800 } },
    { i: 'hat', k: 'd', p: 'x.g.x.g.x.g.x.gx', v: 0.7, hum: 0.8, pan: 0.2, x: { dec: 0.03, f: 6000 } },
    { i: 'sub', k: 'b', p: 'R-------..R--.5- R-------..R---A-', oct: 29, v: 0.45 },
    { i: 'crackle', k: 'd', p: 'x---------------', v: 0.9, s: 'fx' },
    { i: 'vibes', k: 'm', p: { A: 'r:8 ab5:4 g5:4 | eb5:8 r:8 | r:4 c5:2 eb5:2 g5:4 ab5:4 | g5:16 | r:8 db6:4 c6:4 | bb5:8 f5:8 | r:4 eb5:2 f5:2 g5:4 c6:4 | bb5:8 e5:8 |' }, o: 'A _*8', v: 0.8, rv: 0.3, dl: 0.25, hum: 0.5 },
  ],
};

// Canteen muzak. Bb major, 112 bpm, light swing.
export const SHOP: TrackDef = {
  id: 'shop', title: 'Canteen Muzak', bpm: 112, swing: 0.12, key: 'Bb major',
  desc: 'Cheerful canteen easy-listening: vibraphone tune, jazz organ pads, walking upright bass, brushes and ride.',
  prog: 'Bbmaj7 | Gm7 | Cm7 | F7 | Dm7 | G7 | Cm7 | F7 | Bbmaj7 | Bb7 | Ebmaj7 | Ebm6 | Dm7 | G7b9 | Cm7 , F7 | Bb6',
  rv: { size: 1.6, damp: 0.55 }, noRage: true,
  parts: [
    { i: 'vibes', k: 'm', p: { A: 'd5:4 f5:4 a5:4 g5:4 | f5:8 d5:8 | eb5:4 g5:4 bb5:4 a5:4 | g5:8 f5:8 | f5:4 a5:4 c6:4 a5:4 | b5:8 g5:8 | g5:4 eb5:4 c5:4 eb5:4 | f5:12 r:4 | d6:6 c6:2 bb5:8 | ab5:8 f5:8 | g5:4 bb5:4 eb6:4 d6:4 | c6:4 bb5:4 gb5:8 | f5:4 a5:4 c6:4 a5:4 | b5:4 ab5:4 f5:8 | eb5:4 g5:4 f5:4 eb5:4 | d5:16 |' }, v: 0.95, rv: 0.25, hum: 0.4 },
    { i: 'organ', k: 'c', p: 'x-------x-------', voices: 4, oct: 60, v: 0.5, x: { reg: 'jazz', perc: 0 } },
    { i: 'upright', k: 'b', p: { A: 'R---3---5---A---', B: 'R---5---3---A---' }, o: 'AB', oct: 34, v: 1 },
    { i: 'ride', k: 'd', p: 'x...x..xx...x..x', v: 0.6, pan: 0.3, hum: 0.5 },
    { i: 'brush', k: 'd', p: '....x.......x...', v: 0.6, x: { att: 0.02 } },
    { i: 'kick', k: 'd', p: 'x.......x.......', v: 0.7, x: { f: 58, dec: 0.2, click: 0.05, punch: 2 } },
  ],
};

// Lift muzak. C major, 100 bpm.
export const LIFT: TrackDef = {
  id: 'lift', title: 'Going Up', bpm: 100, key: 'C major',
  desc: 'Lift muzak: marimba tune over nylon-guitar bossa comping, upright bass and shaker.',
  prog: 'Cmaj7 | Am7 | Dm7 | G13 | Em7 | A7b9 | Dm9 | G13',
  rv: { size: 1.2, damp: 0.6 }, noRage: true,
  parts: [
    { i: 'marimba', k: 'm', p: { A: 'e5:4 g5:2 b5:2 a5:8 | c6:4 b5:2 g5:2 e5:8 | f5:4 a5:2 c6:2 b5:4 a5:4 | g5:12 r:4 | g5:4 b5:2 d6:2 c6:4 b5:4 | c#6:4 bb5:4 g5:4 e5:4 | f5:4 e5:2 d5:2 c5:4 e5:4 | d5:16 |' }, v: 1, rv: 0.2, hum: 0.4 },
    { i: 'nylon', k: 'c', p: 'x--x--x---x-x--- --x---x---x--x--', voices: 4, oct: 58, v: 0.8, x: { strum: 0.01 }, hum: 0.5 },
    { i: 'upright', k: 'b', p: 'R-----5-R-----5-', oct: 31, v: 0.95 },
    { i: 'shaker', k: 'd', p: 'xgogxgogxgogxgog', v: 0.45, pan: 0.3 },
    { i: 'clave', k: 'd', p: 'x..x..x...x.x... ..x.x...x..x....', o: '_*8 A*8', v: 0.35, pan: -0.3 },
  ],
};

// Random event room. D minor, 96 bpm, quirky.
export const EVENT: TrackDef = {
  id: 'event', title: 'Mandatory Fun', bpm: 96, swing: 0.15, key: 'D minor',
  desc: 'Quirky "something is up" cue: pizzicato, staccato clarinet tune, glockenspiel sprinkles and a tiptoe beat.',
  prog: 'Dm | Gm/D | A7/C# | Dm | Bb | Gm6 | A7sus4 | A7',
  rv: { size: 1.4, damp: 0.5 }, noRage: true,
  parts: [
    { i: 'clarinet', k: 'm', p: { A: 'd5:2 r:2 f5:2 r:2 a5:4 g#5:2 a5:2 | bb5:4 g5:4 d5:8 | c#5:2 r:2 e5:2 r:2 g5:4 f5:2 e5:2 | d5:12 r:4 | d5:2 r:2 f5:2 r:2 bb5:4 a5:2 g5:2 | e5:4 g5:4 bb5:4 g5:4 | a5:4 d5:4 g5:4 e5:4 | e5:12 r:4 |' }, v: 0.9, rv: 0.2, hum: 0.4 },
    { i: 'pizz', k: 'b', p: { A: 'R...5...R...5...', B: 'R...5...3...A...' }, o: 'AAAB', oct: 38, v: 1 },
    { i: 'pizz', k: 'c', p: '..x...x...x...x.', voices: 3, oct: 62, v: 0.55 },
    { i: 'glock', k: 'a', p: '..............2. ......3.........', o: '_*4 A*4', voices: 3, oct: 79, v: 0.45, rv: 0.4 },
    { i: 'tick', k: 'd', p: 'x...x...x...x...', v: 0.3, pan: -0.3 },
    { i: 'brush', k: 'd', p: '....x.......x...', v: 0.45 },
    { i: 'kick', k: 'd', p: 'x.......x.......', v: 0.8, x: { f: 60, dec: 0.18, click: 0.05, punch: 2 } },
  ],
};

// Daily challenge. A major, 118 bpm, upbeat electro-pop.
export const DAILY: TrackDef = {
  id: 'daily', title: 'Daily Stand-Up', bpm: 118, key: 'A major',
  desc: 'Bright electro-pop for the daily run: four-on-the-floor, plucked arps, square-wave lead and synth bass.',
  prog: 'Amaj9 | F#m9 | Dmaj9 | E9sus4',
  rv: { size: 1.8, damp: 0.5 }, delay: { beats: 0.75, fb: 0.35 }, rageLow: 33,
  parts: [
    { i: 'kick', k: 'd', p: { A: 'X...x...X...x...', F: 'X...x...X...x.xx' }, o: 'AAAAAAAF', v: 0.6, x: { f: 52, dec: 0.33, click: 0.4 } },
    { i: 'clap', k: 'd', p: '....x.......x...', v: 0.5, rv: 0.2 },
    { i: 'hat', k: 'd', p: 'gxgxgxgxgxgxgxgx', v: 0.38, pan: 0.2 },
    { i: 'hat', k: 'd', p: '..x...x...x...x.', v: 0.25, x: { dec: 0.14 } },
    { i: 'synbass', k: 'b', p: 'R.RO..R.R.RO..5.', oct: 33, v: 0.9 },
    { i: 'pluck', k: 'a', p: '0120120120120121', voices: 3, oct: 69, v: 0.6, dl: 0.3, pan: -0.2 },
    { i: 'lead', k: 'm', p: { A: 'c#6:2 r:2 b5:2 a5:2 r:2 e5:2 f#5:4 | a5:4 g#5:2 f#5:2 c#5:8 | d5:2 r:2 e5:2 f#5:2 r:2 a5:2 c#6:4 | b5:12 r:4 | e6:2 r:2 c#6:2 b5:2 r:2 a5:2 b5:4 | c#6:4 a5:2 f#5:2 e5:8 | f#5:2 a5:2 c#6:2 e6:2 r:2 d6:2 c#6:4 | b5:16 |' }, o: '_*4 A A', v: 1.0, dl: 0.25, rv: 0.2, tr: -12 },
    { i: 'pad', k: 'c', p: 'x---------------', voices: 4, oct: 64, v: 0.45, x: { cut: 1500 } },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.28 },
  ],
};

// End credits. F major (the Act 1 theme, slowed and reharmonised in texture), 88 bpm.
export const CREDITS: TrackDef = {
  id: 'credits', title: 'Out Of Office', bpm: 88, swing: 0.12, key: 'F major',
  desc: 'Reflective reprise of the Act 1 theme: piano and strings, soft brushed groove, flute taking the second half.',
  prog: ACT1_PROG, rv: { size: 2.8, damp: 0.5 }, noRage: true,
  parts: [
    { i: 'piano', k: 'm', p: { A: ACT1_MEL_A }, o: 'A _*16', v: 1.3, rv: 0.35, hum: 0.5 },
    { i: 'flute', k: 'm', p: { B: ACT1_MEL_B }, o: '_*16 B', v: 0.8, rv: 0.4, hum: 0.5 },
    { i: 'rhodes', k: 'c', p: 'x-------x---x---', voices: 4, oct: 58, rootless: true, v: 0.75, rv: 0.25, hum: 0.6 },
    { i: 'strings', k: 'c', p: 'x---------------', voices: 4, oct: 65, v: 0.5, rv: 0.45, x: { att: 0.9 } },
    { i: 'upright', k: 'b', p: 'R-------5---R---', oct: 29, v: 0.9 },
    { i: 'brush', k: 'd', p: 'x...x...x...x...', v: 0.4, x: { att: 0.03, dec: 0.2 } },
    { i: 'kick', k: 'd', p: 'x.......x.......', v: 0.7, x: { f: 56, dec: 0.25, click: 0.05, punch: 2 } },
    { i: 'ride', k: 'd', p: 'x...x..xx...x..x', o: '_*16 A*16', v: 0.4, pan: 0.3 },
  ],
};
