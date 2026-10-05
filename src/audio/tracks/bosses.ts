// Boss themes. Each escalates across setPhase(1..3): layers enter via ph/phMax, tempo via phaseBpm,
// tone via phaseCut, and (finale) key via phaseTr. Every phase change also fires an impact on the bar line.
import type { TrackDef } from '../sequencer';
import { ANTHEM_PROG, ANTHEM_MEL } from './acts';

// ==================================================================================================
// BOSS 1 — "Ticket Logged" (Facilities Manager, basement plant room). E phrygian, 132 bpm.
// Industrial: pipe clanks, acid, alarm siren in phase 2 (fire alarm), dark breakbeat + reese in phase 3 (lights out).
export const BOSS1: TrackDef = {
  id: 'boss1', title: 'Ticket Logged', bpm: 132, key: 'E phrygian',
  desc: 'Industrial acid techno with pipe clanks and a brass "ticket logged" motif; phase 2 adds the fire-alarm siren and hats, phase 3 goes dark (low-pass) with a reese bass and breakbeat toms, faster.',
  prog: 'Em | Em | F | Em | C | Am | F | B7',
  phaseBpm: [1, 1.03, 1.07], phaseCut: [9000, 16000, 4200], rv: { size: 1.6, damp: 0.4 }, rageLow: 28,
  parts: [
    { i: 'kick', k: 'd', p: 'X...X...X...X...', phMax: 2, v: 1, x: { f: 49, dec: 0.38, click: 0.6, drive: 2, post: 0.75 } },
    { i: 'kick', k: 'd', p: 'X...X...X..xX.x.', ph: 3, v: 0.6, x: { f: 47, dec: 0.4, click: 0.7, drive: 3, post: 0.7 } },
    { i: 'clap', k: 'd', p: '....x.......x...', v: 0.5, rv: 0.25 },
    { i: 'clank', k: 'd', p: '..x.....x..x....', phMax: 1, v: 1, pan: -0.3, x: { f: 300 }, rv: 0.2 },
    { i: 'clank', k: 'd', p: '..x..x..x..x.x.x', ph: 2, v: 1, pan: -0.3, x: { f: 300 }, rv: 0.2 },
    { i: 'clank', k: 'd', p: '......x.......x. ......x....x..x.', v: 0.9, pan: 0.35, x: { f: 520, dec: 0.7 }, dl: 0.25 },
    { i: 'hat', k: 'd', p: '..x...x...x...x.', v: 1.1, x: { dec: 0.1 } },
    { i: 'hat', k: 'd', p: 'gxgxgxgXgxgxgxgX', ph: 2, v: 1.1, pan: 0.25 },
    { i: 'acid', k: 'b', p: { A: 'R.RR.Rb.R.RO.R5.', B: 'R.RR.Rb.R.RO.ROA' }, o: 'AAAB', phMax: 1, oct: 28, v: 0.7, x: { cut: 300, q: 12 } },
    { i: 'acid', k: 'b', p: { A: 'R.RRORb.R.RO.R5O', B: 'RORRORb.ROROR5OA' }, o: 'AAAB', ph: 2, phMax: 2, oct: 28, v: 0.7, x: { cut: 650, q: 15, drive: 3 } },
    { i: 'reese', k: 'b', p: 'R-.R-.R-.R-.R-O-', ph: 3, oct: 28, v: 0.8, x: { cut: 500, wob: 4.4 } },
    { i: 'brass', k: 'm', p: { A: 'e4+b4:2 r:2 g4+d5:2 r:2 f4+c5:6 r:2 | r:16 |' }, v: 1.0, rv: 0.25, x: { att: 0.005, s: 0.6 } },
    { i: 'siren', k: 'm', p: { A: 'e5:16 | f5:16 | f5:8 e5:8 | e5:16 | g5:16 | e5:16 | f5:8 a5:8 | f#5:8 d#5:8 |' }, ph: 2, phMax: 2, v: 0.7, rv: 0.3 },
    { i: 'beep', k: 'm', p: { A: 'b5:2 r:2 b5:2 r:2 b5:2 r:6' }, o: 'A___', ph: 2, phMax: 2, v: 0.6, x: { g: 0.08 } },
    { i: 'tom', k: 'd', p: 'x..x..x.x.x..x.. x..x..x.x..xx.x.', ph: 3, v: 0.3, x: { f: 92 }, rv: 0.2 },
    { i: 'snare', k: 'd', p: '....x..g.x..x..g', ph: 3, v: 0.45, rv: 0.2 },
    { i: 'pad', k: 'c', p: 'x---------------', ph: 3, voices: 3, oct: 52, v: 0.5, x: { cut: 600, q: 4, sweep: 0.25 } },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.3 },
  ],
};

// ==================================================================================================
// BOSS 2 — "Always Be Closing" (Head of Sales). G dorian, 126 bpm. Sleazy disco-funk house with brass and the sales gong.
export const BOSS2: TrackDef = {
  id: 'boss2', title: 'Always Be Closing', bpm: 126, key: 'G dorian',
  desc: 'Disco-funk sales-floor house: octave bass, brass hook, the sales gong every four bars; phase 2 (quarter-end) adds cowbell "cash", organ skank and a rising acid arp; phase 3 (windows smashed) adds wind, breakbeat snares and string stabs, faster.',
  prog: 'Gm7 | C9 | Gm7 | C9 | Ebmaj7 | D7#9 | Gm7 | D7#9',
  phaseBpm: [1, 1.02, 1.06], rv: { size: 2.2, damp: 0.5 }, rageLow: 31,
  parts: [
    { i: 'kick', k: 'd', p: 'X...X...X...X...', v: 1, x: { f: 52, dec: 0.35, click: 0.45 } },
    { i: 'clap', k: 'd', p: '....x.......x...', v: 0.55, rv: 0.25 },
    { i: 'hat', k: 'd', p: '..x...x...x...x.', v: 0.22, x: { dec: 0.18 } },
    { i: 'shaker', k: 'd', p: 'gxgxgxgxgxgxgxgx', ph: 2, v: 0.4, pan: 0.4 },
    { i: 'synbass', k: 'b', p: 'R.O.R.O.R.O.R.Ob', phMax: 1, oct: 31, v: 0.9, x: { cut: 2400 } },
    { i: 'synbass', k: 'b', p: 'R.ORr.O.R.ORr.OA', ph: 2, oct: 31, v: 0.9, x: { cut: 3000 } },
    { i: 'brass', k: 'c', p: '......x-..x..... x-.x......x-....', voices: 4, oct: 65, v: 0.7, rv: 0.2, x: { att: 0.005, s: 0.5 } },
    { i: 'brass', k: 'm', p: { A: 'g4:2 bb4:2 r:2 c5:4 r:2 bb4:2 g4:2 | r:4 d5:2 r:2 c5:2 bb4:2 g4:4 |' }, v: 1.1, rv: 0.2, tr: 12, x: { att: 0.01 } },
    { i: 'gong', k: 'd', p: 'x...............', o: 'A___', phMax: 2, v: 0.55, rv: 0.3 },
    { i: 'cowbell', k: 'd', p: '..x...x...x..x.x', ph: 2, v: 0.45, pan: 0.3 },
    { i: 'organ', k: 'c', p: '..x-..x-..x-..x-', ph: 2, voices: 3, oct: 62, v: 0.55, x: { reg: 'gospel' } },
    { i: 'acid', k: 'a', p: '0123012301230123', ph: 2, phMax: 2, voices: 3, oct: 55, v: 0.45, dl: 0.25, x: { cut: 600, q: 10, g: 0.18 } },
    { i: 'wind', k: 'd', p: 'x---------------', o: 'A_', ph: 3, v: 0.9, s: 'fx', x: { g: 0.35 } },
    { i: 'snare', k: 'd', p: '....x..x.x..x..x', ph: 3, v: 0.5, rv: 0.2 },
    { i: 'strings', k: 'c', p: 'x-..x-......x-..', ph: 3, voices: 4, oct: 67, v: 0.65, x: { att: 0.01, rel: 0.15 } },
    { i: 'acid', k: 'b', p: 'R.RO.Rb.R.5O.RbO', ph: 3, oct: 43, v: 0.8, x: { cut: 900, q: 14 } },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.3 },
  ],
};

// ==================================================================================================
// BOSS 3 — "This Call Is Being Recorded" (Head of Compliance). D minor, 128 bpm. Harpsichord ostinato + dark techno.
const BOSS3_MOTIF =
  'd5:4 a4:4 f5:4 e5:4 | e5:4 c5:4 g4:8 | d5:4 bb4:4 f4:4 g4:4 | a4:4 c#5:4 e5:8 | ' +
  'd5:4 bb4:4 g4:4 bb4:4 | c#5:4 e5:4 a4:8 | d5:4 f5:4 a5:4 g5:4 | f5:4 d5:4 c#5:8 |';
export const BOSS3: TrackDef = {
  id: 'boss3', title: 'This Call Is Being Recorded', bpm: 128, key: 'D minor',
  desc: 'Harpsichord ostinato over a lament bass and cold techno; phase 2 (audit shutters) adds church organ, stomping toms and the compliance motif; phase 3 (shredder) adds a grinding conveyor rhythm, choir and reese, faster.',
  prog: 'Dm | C | Bb | A7 | Gm | A7 | Dm , Dm/C | Bbmaj7 , A7',
  phaseBpm: [1, 1.03, 1.06], rv: { size: 2.6, damp: 0.45 }, rageLow: 26,
  parts: [
    { i: 'harpsi', k: 'a', p: '0121312101213121', voices: 3, oct: 62, v: 0.75, dl: 0.12 },
    { i: 'kick', k: 'd', p: 'X...X...X...X...', v: 1, x: { f: 48, dec: 0.36, click: 0.55 } },
    { i: 'tick', k: 'd', p: '..x...x...x...x.', phMax: 1, v: 0.5, pan: 0.4 },
    { i: 'hat', k: 'd', p: '..x...x...x...x.', ph: 2, v: 0.45, x: { dec: 0.07 } },
    { i: 'sub', k: 'b', p: '..R-..R-..R-..R-', oct: 26, v: 0.9 },
    { i: 'clap', k: 'd', p: '....x.......x...', v: 0.42, rv: 0.4 },
    { i: 'organ', k: 'c', p: 'x-------x-------', ph: 2, voices: 4, oct: 60, v: 0.5, rv: 0.35, x: { reg: 'church', lfo: 3 } },
    { i: 'tom', k: 'd', p: 'x.......x..x.... x.......x..x..x.', ph: 2, v: 0.35, x: { f: 80, dec: 0.4 }, rv: 0.3 },
    { i: 'brass', k: 'm', p: { A: BOSS3_MOTIF }, ph: 2, phMax: 2, v: 0.6, rv: 0.3 },
    { i: 'choir', k: 'm', p: { A: BOSS3_MOTIF }, ph: 3, v: 0.75, rv: 0.4, x: { v: 'o' } },
    { i: 'clank', k: 'd', p: '.x.x.x.x.x.x.x.x', ph: 3, v: 0.7, pan: -0.4, x: { f: 610, dec: 0.4 } },
    { i: 'hat', k: 'd', p: 'xgxgxgxgxgxgxgxg', ph: 3, v: 0.35, pan: 0.3 },
    { i: 'reese', k: 'b', p: 'R-R-R-R-R-R-R-O-', ph: 3, oct: 38, v: 0.45, x: { cut: 900, drive: 2.5 } },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.28 },
  ],
};

// ==================================================================================================
// BOSS 4 — "Golden Parachute" (the CEO). B minor, 136 bpm. The anthem melody reprised in minor as a cult hymn.
const BOSS4_MEL =
  'f#5:8 e5:4 d5:4 | d5:8 b4:8 | a4:6 b4:2 d5:4 f#5:4 | e5:12 r:4 | f#5:8 g5:4 f#5:4 | d5:8 b4:8 | e5:6 f#5:2 g5:4 b5:4 | a#5:8 f#5:8 |';
export const BOSS4: TrackDef = {
  id: 'boss4', title: 'Golden Parachute', bpm: 136, key: 'B minor',
  desc: 'The company anthem reprised in B minor as a cult hymn: church organ, choir and timpani over a dark kick (boardroom); phase 2 (office) adds hard drums, acid and supersaw stabs; phase 3 (rooftop) adds helicopter rotor, choir lead and snare rolls, faster.',
  prog: 'Bm | G | D | A | Bm | G | Em7 | F#7',
  phaseBpm: [1, 1.03, 1.06], rv: { size: 3.2, damp: 0.45 }, rageLow: 35,
  parts: [
    { i: 'organ', k: 'c', p: 'x---------------', voices: 4, oct: 62, v: 0.55, rv: 0.4, x: { reg: 'church', lfo: 2 } },
    { i: 'organ', k: 'm', p: { A: BOSS4_MEL }, phMax: 1, v: 1.1, rv: 0.4, x: { reg: 'church', lfo: 2 } },
    { i: 'choir', k: 'c', p: 'x---------------', voices: 3, oct: 66, v: 0.6, rv: 0.5 },
    { i: 'timpani', k: 'b', p: { A: 'R.......R.......', F: 'R.......R.R.RRRR' }, o: 'A___A__F', oct: 35, v: 0.8 },
    { i: 'kick', k: 'd', p: 'X...X...X...X...', v: 1, x: { f: 48, dec: 0.42, click: 0.5, drive: 1.5 } },
    { i: 'sub', k: 'b', p: 'R---R---R---R---', phMax: 1, oct: 35, v: 0.8 },
    { i: 'clap', k: 'd', p: '....x.......x...', ph: 2, v: 0.55, rv: 0.35 },
    { i: 'hat', k: 'd', p: 'gxXxgxXxgxXxgxXx', ph: 2, v: 0.35, pan: 0.2 },
    { i: 'acid', k: 'b', p: 'R.RO.Rb.R.5O.RbO', ph: 2, oct: 35, v: 0.55, x: { cut: 520, q: 13, drive: 2.5 } },
    { i: 'supersaw', k: 'c', p: 'x-.x-.x-..x-.x-.', ph: 2, voices: 4, oct: 64, v: 0.5, dl: 0.2, x: { pluck: 0.2, cut: 4000, s: 0.3 } },
    { i: 'brass', k: 'm', p: { A: BOSS4_MEL }, ph: 2, phMax: 2, v: 0.6, rv: 0.3 },
    { i: 'rotor', k: 'd', p: 'x---------------', ph: 3, v: 0.8, s: 'fx', x: { rate: 11.5, g: 0.5 } },
    { i: 'choir', k: 'm', p: { A: BOSS4_MEL }, ph: 3, v: 0.8, rv: 0.4, x: { v: 'a', att: 0.08 } },
    { i: 'supersaw', k: 'm', p: { A: BOSS4_MEL }, ph: 3, v: 0.6, rv: 0.25, tr: -12, x: { n: 5, cut: 5000 } },
    { i: 'snare', k: 'd', p: '....x.......x... ....x.....x.xxxx', ph: 3, v: 0.45, rv: 0.2 },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.3 },
  ],
};

// ==================================================================================================
// CEO FINALE — "All-Staff Email". D major -> Eb major (phase 3 key change), 145 bpm. The big one.
export const CEO_FINALE: TrackDef = {
  id: 'ceo_finale', title: 'All-Staff Email', bpm: 145, key: 'D major (Eb in phase 3)',
  desc: 'The anthem as an all-out finale: phase 1 is a choir/organ/timpani overture on a half-time kick, phase 2 slams into hard techno with the anthem on supersaws and brass, phase 3 truck-driver key change up a semitone with choir lead, 16th hats and rolling snares.',
  prog: ANTHEM_PROG,
  phaseBpm: [1, 1, 1.03], phaseTr: [0, 0, 1], rv: { size: 3.4, damp: 0.4 }, rageLow: 33,
  parts: [
    { i: 'organ', k: 'c', p: 'x---------------', voices: 4, oct: 60, v: 0.45, rv: 0.4, x: { reg: 'church', lfo: 2 } },
    { i: 'choir', k: 'c', p: 'x---------------', voices: 4, oct: 66, v: 0.6, rv: 0.5 },
    { i: 'strings', k: 'b', p: 'R---------------', oct: 38, v: 1.5, x: { att: 0.05 } },
    { i: 'timpani', k: 'b', p: { A: 'R.......R.......', F: 'R...R...R.R.RRRR' }, o: 'A__FA__F', oct: 38, v: 0.8 },
    { i: 'brass', k: 'm', p: { A: ANTHEM_MEL }, phMax: 1, v: 1.0, rv: 0.35 },
    { i: 'glock', k: 'm', p: { A: ANTHEM_MEL }, v: 0.45, rv: 0.4, tr: 12 },
    { i: 'kick', k: 'd', p: 'X.........x.....', phMax: 1, v: 0.85, x: { f: 50, dec: 0.5, click: 0.3, sub: 0.3 } },
    { i: 'clap', k: 'd', p: '........X.......', phMax: 1, v: 0.5, rv: 0.6 },
    { i: 'kick', k: 'd', p: { A: 'X...X...X...X...', F: 'X...X...X...X.XX' }, o: 'AAAAAAAF', ph: 2, v: 0.95, x: { f: 50, dec: 0.42, drive: 3.5, punch: 4.5, click: 0.7, post: 0.6 } },
    { i: 'rumble', k: 'b', p: '.R--.R--.R--.R--', ph: 2, oct: 26, v: 0.75 },
    { i: 'clap', k: 'd', p: '....x.......x...', ph: 2, v: 0.5, rv: 0.3 },
    { i: 'hat', k: 'd', p: '..x...x...x...x.', ph: 2, v: 0.28, x: { dec: 0.15 } },
    { i: 'hat', k: 'd', p: 'gxXxgxXxgxXxgxXx', ph: 3, v: 0.36, pan: 0.2 },
    { i: 'supersaw', k: 'm', p: { A: ANTHEM_MEL }, ph: 2, v: 0.8, rv: 0.25, x: { n: 5, cut: 6500 } },
    { i: 'supersaw', k: 'c', p: 'x-.x-.x-..x-.x-.', ph: 2, voices: 4, oct: 62, v: 0.45, dl: 0.2, x: { pluck: 0.22, cut: 4000, s: 0.3 } },
    { i: 'brass', k: 'm', p: { A: ANTHEM_MEL }, ph: 2, v: 0.8, rv: 0.3, tr: -12 },
    { i: 'acid', k: 'b', p: 'R.RO.Rb.R.5O.RbO', ph: 3, oct: 38, v: 0.75, x: { cut: 600, q: 14, drive: 3 } },
    { i: 'choir', k: 'm', p: { A: ANTHEM_MEL }, ph: 3, v: 0.8, rv: 0.45, x: { v: 'a', att: 0.06 } },
    { i: 'snare', k: 'd', p: '....x.......x... ....x.....x.xxxx', ph: 3, v: 0.42, rv: 0.25 },
    { i: 'crash', k: 'd', p: 'x...............', o: 'A _*7', v: 0.32 },
    { i: 'riser', k: 'd', p: 'x---------------', o: '_*15 A', ph: 2, v: 0.8, s: 'fx', x: { g: 0.12 } },
  ],
};
