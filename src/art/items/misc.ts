// Projectiles, pickups and cursors. Hand-authored ASCII pixel art.
import type { Sprite } from '../../render/canvas';
import { sprite } from '../../render/canvas';
import type { Pal } from './gfx';
import { bake, outlinedSprite } from './gfx';
import { WEAPONS } from './weapons';

// ---------------------------------------------------------------------------- projectiles
interface PDef { rows: string[] | (() => string[]); pal?: Pal; outline?: boolean }

function waveRows(): string[] {
  // two concentric ')' arcs bulging right (+x)
  const off = [0, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 0];
  const out: string[] = [];
  for (let y = 0; y < 12; y++) {
    const row = Array(9).fill('.');
    const a = off[y], b = off[y] + 3;
    row[a] = 'x'; row[a + 1] = 'w';
    if (b + 1 < 9) { row[b] = 'p'; row[b + 1] = 'w'; }
    out.push(row.join(''));
  }
  return out;
}

function fromWeapon(id: string): string[] {
  const d = WEAPONS[id];
  return typeof d.held === 'function' ? d.held() : d.held;
}

const PROJ: Record<string, PDef> = {
  staple: { rows: ['bbbb', 'b...', 'bbbb'], pal: {} },
  nail: { rows: ['a.......', 'abbbbbbc', 'a.......'] },
  laser: { rows: ['.rr.', 'rwwr', 'rwwr', '.rr.'], pal: { r: '#ff6a4a', w: '#fff3ea' }, outline: false },
  beam: { rows: ['RRRRRRRRRRRRRRRR', 'wwwwwwwwwwwwwwww', 'RRRRRRRRRRRRRRRR'], pal: { R: '#e5412e', w: '#fff3ea' }, outline: false },
  calc: { rows: ['.dddddd.', 'dGggggGd', 'dGwGGGGd', '.dddddd.'] },
  tape: { rows: ['tTTTTTTTTt', 'TtTtTTtTTT', 'tTTTTTTTTt'], pal: { t: '#efe2b0', T: '#d3bd82' } },
  confetti: { rows: [
    '..R...y.',
    '.B...G..',
    'p..y..R.',
    '..G.B...',
    'y...p..G',
    '.R...y..',
    '...B..p.',
    'G..R....',
  ], outline: false },
  phone: { rows: () => fromWeapon('desk_phone') },
  stapler_thrown: { rows: () => fromWeapon('stapler') },
  binder: { rows: () => fromWeapon('policy_binder') },
  toolbox: { rows: [
    '....dddddd....',
    '...d......d...',
    '...d......d...',
    'RRRRRRRRRRRRRR',
    'rRRRRRRRRRRRRq',
    'rRRRRbbbbRRRRq',
    'qqqqqbYYbqqqqq',
    'RRRRRbbbbRRRRq',
    'RRRRRRRRRRRRRq',
    'qqqqqqqqqqqqqq',
  ] },
  contract: { rows: [
    'WWWWWWWWWV',
    'WVVVVVVVWV',
    'WWWWWWWWWV',
    'WVVVVVVWWV',
    'WWWWWWWWWV',
    'WVVVWRRRWV',
    'WWWWWRqRWV',
    'VVVVVVVVVv',
  ] },
  scream: { rows: waveRows, outline: false },
  golf_ball: { rows: ['.WWW.', 'WwWWV', 'WWWVV', 'WWVVv', '.VVv.'], pal: { w: '#ffffff' } },
  paper: { rows: [
    'WWWWWWWV',
    'WVVVVVWV',
    'WWWWWWWV',
    'WVVVVWWV',
    'WWWWWWVv',
    'VVVVVVv.',
  ] },
  coffee: { rows: [
    '...N.N..',
    '.NTTNTN.',
    'NTtTTTTN',
    '.TTtTTNN',
    'NTTTTTTN',
    '.NTTNTN.',
    '..N.TN..',
    '.....N..',
  ], pal: { N: '#5a3a24', T: '#8a5a36', t: '#b98355' }, outline: false },
  invite: { rows: [
    'RRRRRRRRRR',
    'RrRRRRRRRq',
    'WWWWWWWWWV',
    'WBBBBWWWWV',
    'WBBBBBBWWV',
    'WWWWWBBBWV',
    'WWWWWWWWWV',
    'VVVVVVVVVv',
  ] },
  pen: { rows: [
    'qqRRRRRRRRdd.',
    'qrRRRRRRRRRdd',
    'qqRRRRRRRRdd.',
  ] },
};

const pcache = new Map<string, Sprite>();
export function projectile(kind: string): Sprite {
  let s = pcache.get(kind);
  if (!s) {
    const d = PROJ[kind] ?? PROJ.paper;
    const rows = typeof d.rows === 'function' ? d.rows() : d.rows;
    if (d.outline === false) {
      const c = bake(rows, d.pal);
      s = sprite(c, Math.floor(c.width / 2), Math.floor(c.height / 2));
    } else {
      s = outlinedSprite(rows, d.pal ?? {}, 'c', 'c');
    }
    pcache.set(kind, s);
  }
  return s;
}

// ---------------------------------------------------------------------------- pickups (origin bottom-centre)
const PICK: Record<string, PDef> = {
  cash_coin: { rows: [
    '..uuuu..',
    '.uYyyYu.',
    'uYyYYYYu',
    'uYyYuYYu',
    'uYYYuYYu',
    'uYYYYYYu',
    '.uYYYYu.',
    '..uuuu..',
  ] },
  cash_note: { rows: [
    '.ggggggggg.',
    'gGGGGGGGGGh',
    'gGGgGGGgGGh',
    'gGgGGGGGgGh',
    'gGGgGGGgGGh',
    'gGGGGGGGGGh',
    '.hhhhhhhhh.',
  ] },
  cash_bundle: { rows: [
    '.gggggggggg.',
    'gGGGGGGGGGGh',
    'gGGGGGGGGGGh',
    'WWWWGgGWWWWV',
    'WWWWGGGWWWWV',
    'WWWWGGGWWWWV',
    'hGGGGGGGGGhh',
    'hGGGGGGGGGhh',
    '.hhhhhhhhhh.',
  ] },
  heal_biscuit: { rows: [
    '...tttt...',
    '.ttTTTTTt.',
    'tTTTNTTTTt',
    'tTTTTTTNTT',
    'tTNTTTTTTm',
    'tTTTTNTTTm',
    '.TTTTTTTm.',
    '..mmTTmm..',
    '....mm....',
  ] },
  heal_sandwich: { rows: [
    '.......WWt..',
    '....WWWWWTT.',
    '.WWWWWWWWTT.',
    'TTGGGGgGGGTT',
    'WRRRRRRRRRRW',
    'WYYYYYYYYYYW',
    '.tWWWWWWWWWt',
    '..TTTTTTTTT.',
  ] },
  heal_firstaid: { rows: [
    '...cccccc...',
    '...c....c...',
    'WWWWWWWWWWWW',
    'WWWWWRRWWWWV',
    'WWWWWRRWWWWV',
    'WRRRRRRRRRWV',
    'WRRRRRRRRRWV',
    'WWWWWRRWWWWV',
    'WWWWWRRWWWWV',
    'VVVVVVVVVVVv',
  ] },
  espresso: { rows: [
    '...w.w....',
    '....w.w...',
    '..WWWWWWV.',
    '..WNNNNWVV',
    '..WNmmNWV.V',
    '..WWWWWWV.V',
    '...WWWWVV.',
    '.bbbbbbbbb',
    '..bcccccb.',
  ], pal: { N: '#3a2418', m: '#6b4228' } },
  leave_token: { rows: [
    '...hhhhhh...',
    '.hhGggGGGhh.',
    '.hGGGYGGGGh.',
    'hGGYGYGYGGGh',
    'hGGGYYYGGGGh',
    'hGYYYYYYYGGh',
    'hGGGYYYGGGGh',
    'hGGYGYGYGGGh',
    '.hGGGYGGGGh.',
    '.hhGGGGGGhh.',
    '...hhhhhh...',
  ] },
  ammo_box: { rows: [
    '.hhhhhhhhhh.',
    'hGGGGGGGGGGh',
    'hGgGGGGGGGGh',
    'hGGYYYYYYGGh',
    'hGGYuYuYuGGh',
    'hGGYYYYYYGGh',
    'hGGGGGGGGGGh',
    'hhhhhhhhhhhh',
  ], pal: { G: '#59704a', g: '#86a070', h: '#34462f' } },
  hr_file: { rows: [
    '.RRRRR......',
    'RRRRRRRRRRR.',
    'tTTTTTTTTTTT',
    'TWWWWWWWWWTm',
    'TWdWdWWWWWTm',
    'TWdddWWWWWTm',
    'TWdWdWdddWTm',
    'TWWWWWWWWWTm',
    'TWRRRRRRWWTm',
    'TWWWWWWWWWTm',
    'TTTTTTTTTTTm',
    'mmmmmmmmmmmm',
  ] },
  benefit_envelope: { rows: [
    'wWWWWWWWWWWWWV',
    'WVWWWWWWWWWWVV',
    'WWVWWWWWWWWVWV',
    'WWWVWWWWWWVWWV',
    'WWWWVVYYVVWWWV',
    'WWWWWWYyYuWWWV',
    'WWWWWWYYYuWWWV',
    'WWWWWWWYuWWWWV',
    'WWWWWWWWWWWWWV',
    'VVVVVVVVVVVVVv',
  ] },
  desk_item_box: { rows: [
    '.TTTTTTTTTTTT.',
    'TtttTTTTTTTTTm',
    'TTTTTTYYTTTTTm',
    'mmmmmmYYmmmmmm',
    'TTTTTTYYTTTTTm',
    'TTTTWWWWWWTTTm',
    'TTTTWYWYYWTTTm',
    'TTTTWyYYWWTTTm',
    'TTTTWWWWWWTTTm',
    'TTTTTTTTTTTTTm',
    'TTTTTTTTTTTTTm',
    'mmmmmmmmmmmmmm',
  ] },
  rage_mod: { rows: [
    '...bbbb...',
    '..bwaabb..',
    '.dddddddd.',
    '.RrRRRRRq.',
    '.RrRRoRRq.',
    '.RRRooRRq.',
    '.RRoOOoRq.',
    '.RRoyOoRq.',
    '.RRooOoRq.',
    '.RRRooRRq.',
    '.RRRRRRRq.',
    '.dddddddd.',
    '..cddddc..',
  ] },
  repair_tape: { rows: [
    '..bbbbbbbb..',
    '.baaaaaaaab.',
    'bacccccccaab',
    'bacc....ccab',
    'bacc....ccab',
    'bacccccccccb',
    '.bcccccccdb.',
    '..bbbbbbbb..',
  ] },
  key_card: { rows: [
    '.dddddddddd.',
    'dZZZZZZZZZZd',
    'dZzzZZZZZZZd',
    'dZYYZZZZZZZd',
    'dZYuZZZZZZZd',
    'deeeeeeeeeed',
    'dWWWWWWWWWWd',
    '.dddddddddd.',
  ], pal: { d: '#1a3f47' } },
};

const kcache = new Map<string, Sprite>();
export function pickup(kind: string): Sprite {
  let s = kcache.get(kind);
  if (!s) {
    const d = PICK[kind] ?? PICK.desk_item_box;
    const rows = typeof d.rows === 'function' ? d.rows() : d.rows;
    s = outlinedSprite(rows, d.pal ?? {}, 'c', 'b');
    kcache.set(kind, s);
  }
  return s;
}

// ---------------------------------------------------------------------------- cursors
const AIM = [
  '....w....',
  '....w....',
  '....w....',
  '.........',
  'www.Y.www',
  '.........',
  '....w....',
  '....w....',
  '....w....',
];

function pointerRows(): string[] {
  const fill = [
    'W.......',
    'WW......',
    'WWW.....',
    'WWWW....',
    'WWWWW...',
    'WWWWWW..',
    'WWWWWWW.',
    'WWWWWWWW',
    'WWWWW...',
    'WW.WWW..',
    'W..WWW..',
    '....WWW.',
    '....WWW.',
    '.....WW.',
  ];
  // light on the left edge, shade on the right edge of every row
  return fill.map((row) => {
    const a = row.split('');
    const first = a.findIndex((c) => c !== '.');
    const last = a.length - 1 - [...a].reverse().findIndex((c) => c !== '.');
    if (first !== last) { a[first] = 'w'; a[last] = 'V'; }
    return a.join('');
  });
}

const ccache = new Map<string, Sprite>();
export function cursor(kind: 'aim' | 'pointer'): Sprite {
  let s = ccache.get(kind);
  if (!s) {
    if (kind === 'aim') s = outlinedSprite(AIM, { Y: '#26e0d0', w: '#ffffff' }, 4, 4);
    else s = outlinedSprite(pointerRows(), { W: '#f2f0ea', V: '#aeb4bf' }, 0, 0);
    ccache.set(kind, s);
  }
  return s;
}
