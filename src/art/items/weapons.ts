// Held weapon sprites (pointing right, origin at the grip) and 16x16 weapon icons. Hand-authored ASCII pixel art.
import type { Sprite } from '../../render/canvas';
import type { Pal } from './gfx';
import { heldSprite, iconTile, build } from './gfx';

const r = (ch: string, n: number): string => ch.repeat(n);


interface WDef { held: string[] | (() => string[]); ox: number; oy: number; pal?: Pal; icon: string[]; ipal?: Pal }

export const WEAPONS: Record<string, WDef> = {
  fists: {
    ox: 3, oy: 5, pal: { W: '#f0eee8', V: '#c2c0b8' },
    held: [
      '.....sssss...',
      'WWWsFFfFFss..',
      'WWWFFfFFFFFFs',
      'WVWFFFFFFsssd',
      'WVWFFFFFFFFFs',
      'WVWFFFFFFsssd',
      'WVWFFFFFFFFFs',
      'WVWFFFFFFsssd',
      'WWWsFFFFFFFFs',
      '.....sssss...',
    ],
    icon: [
      '..............',
      '..sFFsFFsFFs..',
      '.sFfFFFfFFFFs.',
      '.FFFsFFFsFFFs.',
      '.FFFsFFFsFFFs.',
      '.FFFFFFFFFFFs.',
      '.FfFFFFFFFFFs.',
      '.sFFFFFFFFFss.',
      '..WWWWWWWWWV..',
      '..WWWWWWWWVV..',
      '..VVVVVVVVVv..',
    ],
  },
  keyboard: {
    ox: 2, oy: 3,
    held: [
      'wbbbbbbbbbbbbbbbbbbc',
      'bcRRcaacaacaacaacaac',
      'baacaacaacaacaacaacc',
      'bcaacaacaacaacaacaac',
      'bcccaaaaaaaaaaaccccc',
      'dddddddddddddddddddd',
    ],
    icon: [
      '..............',
      '..............',
      '..wbbbbbbbbbb.',
      '.wbbbbbbbbbbbc',
      '.bcRRcaacaacac',
      '.baacaacaacaac',
      '.bcaacaacaacac',
      '.bcaacaacaacac',
      '.bcccaaaaaccc.',
      '.dddddddddddd.',
    ],
  },
  laptop: {
    ox: 2, oy: 5,
    held: [
      '.wbbbbbbbbbbbbc.',
      'wbbbbbbbbbbbbbbc',
      'dbbbbbbbbbbbbbbc',
      'cbbbbbbbbbbbbbbc',
      'dbbbbbbbwwbbbbbc',
      'cbbbbbbwwwabbbbc',
      'dbbbbbbbwaabbbbc',
      'cbbbbbbbbbbbbbbc',
      'dbbbbbbbbbbbbbbc',
      'ccbbbbbbbbbbbbcc',
      '.dccccccccccccd.',
    ],
    icon: [
      '..............',
      '..wbbbbbbbbc..',
      '..bddddddddc..',
      '..bdBBBBlBdc..',
      '..bdBBBlBBdc..',
      '..bdBBlBBBdc..',
      '..bdBBBBBBdc..',
      '..bddddddddc..',
      '.wbbbbbbbbbbc.',
      '.baaaaaaaaaac.',
      '.bccccccccccc.',
      '.dddddddddddd.',
    ],
  },
  fire_extinguisher: {
    ox: 3, oy: 4,
    held: build(17, 9, (p, rc) => {
      rc(5, 1, 11, 7, 'R'); rc(5, 1, 11, 1, 'r'); rc(5, 7, 11, 1, 'q'); rc(5, 2, 1, 5, 'r');
      p(5, 1, '.'); p(15, 1, '.'); p(5, 7, '.'); p(15, 7, '.');
      rc(8, 3, 5, 3, 'W'); rc(8, 5, 5, 1, 'V'); p(10, 4, 'e'); p(11, 4, 'e');
      rc(14, 2, 1, 5, 'q');
      rc(3, 3, 2, 3, 'c'); rc(0, 2, 3, 5, 'd'); rc(1, 3, 1, 3, 'b');
      rc(0, 0, 5, 1, 'b'); rc(1, 1, 3, 1, 'c'); rc(0, 7, 2, 2, 'e'); p(0, 8, 'd');
    }),
    icon: [
      '......ddd.....',
      '.....dbbbd....',
      '.....dccd.....',
      '....bbddbb....',
      '...rrRRRRRq...',
      '...rRRRRRRq...',
      '...rRWWWWRq...',
      '...RRWVVWRq...',
      '...RRWWWWRq...',
      '...RRRRRRRq...',
      '...RRRRRRRq...',
      '....qqqqqq....',
      '....dddddd....',
    ],
  },
  mop: {
    ox: 4, oy: 2,
    held: [
      r('.', 22) + 'WWVWWVWW',
      r('.', 22) + 'WVWWVWWV',
      r('t', 19) + 'bbc' + 'WVWWVWVV',
      r('m', 19) + 'cdd' + 'WWVWWVVv',
      r('.', 22) + 'WVWWVWVV',
      r('.', 22) + 'VWVVWVWV',
      r('.', 22) + 'V.VvV.Vv',
      r('.', 22) + 'v.v..vv.',
    ],
    icon: [
      '..............',
      '...........tT.',
      '..........tTm.',
      '.........tTm..',
      '........tTm...',
      '.......tTm....',
      '......tTm.....',
      '....cTmc......',
      '...WWWWVv.....',
      '..WWVWWVVv....',
      '..WVWVWVVv....',
      '..VWVVWVv.....',
    ],
  },
  golf_club: {
    ox: 4, oy: 4,
    held: build(29, 9, (p, rc) => {
      rc(0, 3, 9, 1, 'd'); rc(0, 4, 9, 2, 'e'); p(0, 3, 'c');
      rc(9, 4, 15, 1, 'a'); rc(9, 5, 15, 1, 'c');
      rc(22, 3, 4, 3, 'b'); rc(22, 3, 4, 1, 'a'); rc(22, 5, 4, 1, 'c');
      rc(26, 1, 3, 7, 'b'); rc(26, 1, 1, 7, 'a'); rc(28, 1, 1, 7, 'c'); rc(26, 7, 3, 1, 'd'); p(26, 1, 'w'); p(27, 1, 'w');
    }),
    icon: [
      '..............',
      '...........aab',
      '..........abbc',
      '.........abcc.',
      '........abc...',
      '.......abc....',
      '......abc.....',
      '.....dbc......',
      '....edd.......',
      '...ede........',
      '..ede.........',
      '..ee..........',
    ],
  },
  policy_binder: {
    ox: 2, oy: 5,
    held: [
      'jjjjjjjjjjjjj',
      'jBBBBBBBBBBBj',
      'jBlllBBBBBBBj',
      'jBlBBBBBBBBBj',
      'jBBBWWWWWWBBj',
      'jBBBVVVVVVBBj',
      'jBBBWWWWWWBBj',
      'jBBBBBBBBBBBj',
      'jBBBBBBBBBBBj',
      'jBBBBBBBBBBBj',
      'jjjjjjjjjjjjj',
    ],
    icon: [
      '..............',
      '..jjjjjjjjj...',
      '.jBlllBBBBBj..',
      '.jBlBBBBBBBj..',
      '.jBBWWWWWBBj..',
      '.jBBVVVVVBBj..',
      '.jBBWWWWWBBj..',
      '.jBBBBBBBBBj..',
      '.jBBBBBBBBBj..',
      '.jBBBBBBBBBj..',
      '.jBBBBBBBBBj..',
      '..jjjjjjjjj...',
    ],
  },
  clipboard: {
    ox: 2, oy: 5,
    held: [
      'mmmmmmmmmmmmmm',
      'TTTTTTTTTTTTTT',
      'TWWWWWWWWWWWWm',
      'TWVVVVVVVVVVWm',
      'TWWWWWWWWWWWWm',
      'bWVVVVVVVVVVWm',
      'aWWWWWWWWWWWWm',
      'bWVVVVVVVVVVWm',
      'TWWWWWWWWWWWWm',
      'TTTTTTTTTTTTTm',
      'mmmmmmmmmmmmmm',
    ],
    icon: [
      '.....bbbb.....',
      '....bwaabb....',
      '..mmbccccbmm..',
      '..TTTTTTTTTm..',
      '..TWWWWWWWTm..',
      '..TWVVVVVVTm..',
      '..TWWWWWWWTm..',
      '..TWVVVVVVTm..',
      '..TWWWWWWWTm..',
      '..TWVVVVWWTm..',
      '..TWWWWWWWTm..',
      '..TTTTTTTTTm..',
    ],
  },
  briefcase: {
    ox: 2, oy: 5,
    held: [
      '.mmmm.........',
      'mtttTmmmmmmmmm',
      'm..mTTTTTTTTTm',
      'mmmmTTTTTTTTTm',
      'NNNNmTTYYTTTTm',
      'dddNmTTuuTTTTm',
      'NNNNmTTTTTTTTm',
      'mmmmTTTTTTTTTm',
      'mTTTmmmmmmmmmm',
    ],
    icon: [
      '..............',
      '.....mmmm.....',
      '....mt..Tm....',
      '....m....m....',
      '..mmmmmmmmmm..',
      '.mttTTTTTTTTm.',
      '.mTTTTTTTTTTm.',
      '.mmmmmYYmmmmm.',
      '.mTTTTuuTTTTm.',
      '.mTTTTTTTTTTm.',
      '.mmmmmmmmmmmm.',
    ],
  },
  framed_certificate: {
    ox: 2, oy: 5,
    held: [
      'yYYYYYYYYYYu',
      'YuuuuuuuuuuY',
      'YuWWWWWWWWuY',
      'YuWVVVVVVWuY',
      'YuWWWWWWWWuY',
      'YuWVVVWRRWuY',
      'YuWWWWWRqWuY',
      'YuWVVVVVVWuY',
      'YuWWWWWWWWuY',
      'YuuuuuuuuuuY',
      'uuuuuuuuuuuu',
    ],
    icon: [
      '..............',
      '..yYYYYYYYYu..',
      '..YuuuuuuuuY..',
      '..YuWWWWWWuY..',
      '..YuWVVVVWuY..',
      '..YuWWWWWWuY..',
      '..YuWVVVVWuY..',
      '..YuWWWRRWuY..',
      '..YuWWWRqWuY..',
      '..YuuuuuuuuY..',
      '..uuuuuuuuuu..',
    ],
  },
  wrench: {
    ox: 4, oy: 4,
    held: [
      r('.', 15) + '.abbbbbb.',
      r('.', 15) + 'abbbbbbbc',
      r('.', 15) + 'abbbbbbcc',
      r('R', 6) + r('a', 9) + 'abbbc....',
      r('R', 6) + r('b', 9) + 'abbbd....',
      r('q', 6) + r('c', 9) + 'abbbd....',
      r('.', 15) + 'abbbbbbcc',
      r('.', 15) + 'cbbbbbbcc',
      r('.', 15) + '.cbbbbcc.',
    ],
    icon: [
      '.........bbbb.',
      '........abbbbc',
      '.......abbc.bc',
      '......abbd.bbc',
      '.....abbc.bbc.',
      '....abbc..cc..',
      '...RRRc.......',
      '..RRRc........',
      '.RRRc.........',
      '.RRc..........',
      '.qq...........',
    ],
  },
  trophy: {
    ox: 2, oy: 4,
    held: build(15, 9, (p, rc) => {
      rc(0, 1, 2, 7, 'Y'); rc(0, 1, 1, 7, 'y'); rc(1, 1, 1, 7, 'u'); rc(1, 1, 1, 1, 'Y');
      rc(2, 3, 3, 3, 'Y'); rc(2, 3, 3, 1, 'y'); rc(2, 5, 3, 1, 'u');
      for (let x = 5; x < 14; x++) {
        const hh = 1 + Math.floor((x - 5) * 0.55);
        for (let y = 4 - hh; y <= 4 + hh; y++) p(x, y, y <= 4 - hh + 0 ? 'y' : y >= 4 + hh ? 'u' : y < 4 ? 'Y' : 'Y');
      }
      rc(14, 0, 1, 9, 'u');
      for (let y = 1; y < 8; y++) p(14, y, y < 3 ? 'y' : 'Y');
      rc(7, 0, 4, 1, 'u'); p(7, 1, 'u'); p(10, 1, 'u'); rc(7, 8, 4, 1, 'u'); p(7, 7, 'u'); p(10, 7, 'u');
      for (let x = 6; x < 13; x++) p(x, 4 - Math.floor((x - 5) * 0.55), 'w');
    }),
    icon: [
      '..............',
      '..uYYYYYYYYu..',
      '.uYYyYYYYYYYu.',
      '.YuYyYYYYYYuY.',
      '.YuYYYYYYYYuY.',
      '..uuYYYYYYuu..',
      '....uYYYYu....',
      '.....uYYu.....',
      '.....uYYu.....',
      '....uuuuuu....',
      '...uYYYYYYu...',
      '...uuuuuuuu...',
    ],
  },
  letter_opener: {
    ox: 2, oy: 2,
    held: [
      '..YY.......',
      'uYYYwaaaaab',
      'uuYYbbbbbc.',
      '..YY.......',
    ],
    icon: [
      '..............',
      '..........aab.',
      '.........abc..',
      '........abc...',
      '.......abc....',
      '......abc.....',
      '.....YYc......',
      '....YyYu......',
      '...uYYu.......',
      '..uuu.........',
    ],
  },
  scissors: {
    ox: 2, oy: 3,
    held: [
      'OOO.........',
      'OoO.aaaaaaab',
      '.OOOabbbbbc.',
      '..OObbbbcc..',
      '.OOObbcccc..',
      'OoO.dccccc..',
      'OOO.........',
    ],
    icon: [
      '..............',
      '.........a.ab.',
      '........ab.bc.',
      '.......abbbc..',
      '......bbcc....',
      '.....bbc......',
      '..OOO.bc......',
      '.OoOObbc......',
      '.OO.Obc.......',
      '.OoOO.........',
      '..OOO.........',
    ],
  },
  broken_glass: {
    ox: 1, oy: 3,
    held: [
      'dddd.....lw...',
      'dddddlwlllwll.',
      'dddddllwllllllz',
      'dddddllllllzzz.',
      'ddddd.zllzzz...',
      '......zzz.....',
    ],
    icon: [
      '..............',
      '..........lw..',
      '.........lwlz.',
      '........lwllz.',
      '.......lwlllz.',
      '.....dllllzz..',
      '....dddllzz...',
      '...dddd.zz....',
      '..dddd........',
      '..ddd.........',
    ],
  },
  box_cutter: {
    ox: 2, oy: 2,
    held: [
      'OOOOOOOO.....',
      'OoOdOOOO.aaab',
      'OOOOOOOOabbc.',
      'nnnnnnnn.....',
    ],
    icon: [
      '..............',
      '..............',
      '..........aab.',
      '.........abc..',
      '....OOOOOabc..',
      '...OoOdOOOc...',
      '...OOOOOOOc...',
      '...nnnnnnn....',
    ],
  },
  guillotine_blade: {
    ox: 3, oy: 4,
    held: build(27, 9, (p, rc) => {
      // wooden grip
      rc(0, 2, 6, 5, 'T'); rc(0, 2, 6, 1, 't'); rc(0, 6, 6, 1, 'm'); p(0, 2, '.'); p(0, 6, '.'); rc(5, 3, 1, 3, 'm');
      // bracket
      rc(6, 3, 3, 3, 'c'); rc(6, 3, 3, 1, 'b'); p(7, 4, 'e');
      // blade: spine on top, bevel along the bottom, angled tip
      for (let x = 9; x < 27; x++) {
        const yb = x < 18 ? 7 : Math.max(2, 7 - (x - 17));
        for (let y = 0; y <= yb; y++) p(x, y, y < 2 ? (y === 0 ? 'c' : 'd') : y >= yb - 1 ? (y === yb ? 'w' : 'a') : 'b');
        p(x, 1, 'd');
      }
      p(12, 3, 'e'); p(16, 3, 'e'); p(12, 3, 'e');
      rc(10, 2, 7, 1, 'b'); p(10, 2, 'a');
    }),
    icon: [
      '..............',
      '..........ddc.',
      '.........daac.',
      '........daabc.',
      '.......daabc..',
      '......daabc...',
      '.....daabc....',
      '...mmdabc.....',
      '..mTTmdc......',
      '..mTTm........',
      '...mm.........',
    ],
  },
  paper_spike: {
    ox: 3, oy: 3,
    held: build(18, 7, (p, rc) => {
      rc(0, 1, 5, 5, 'N'); rc(1, 2, 3, 3, 'T'); rc(1, 2, 3, 1, 't'); rc(1, 4, 3, 1, 'm'); p(0, 1, '.'); p(0, 5, '.'); p(4, 1, '.'); p(4, 5, '.');
      rc(5, 2, 2, 3, 'c'); rc(5, 2, 2, 1, 'b');
      rc(7, 3, 8, 1, 'a'); rc(7, 4, 8, 1, 'c'); rc(15, 3, 2, 1, 'b'); p(17, 3, 'w');
      rc(7, 2, 5, 1, 'b'); p(7, 2, 'w'); rc(7, 5, 5, 1, 'd');
    }),
    icon: [
      '..............',
      '..............',
      '..........aab.',
      '.........abc..',
      '........abc...',
      '.......abc....',
      '....NNNbc.....',
      '...NmTmN......',
      '..NmTTTmN.....',
      '..NNmmmNN.....',
    ],
  },

  stapler: {
    ox: 2, oy: 4,
    held: [
      '.....rrrrrrrrr',
      '...rrRRRRRRRRR',
      'bbbddddddddddd',
      'bacdcccccccccc',
      'dddeeeeeeeeee.',
      '..dRRRRRRRRq..',
      '..qqqqqqqqqq..',
    ],
    icon: [
      '..............',
      '..............',
      '......rrrrrrr.',
      '....rrRRRRRRRR',
      '...rRRRRRRRRRR',
      '..bbddddddddd.',
      '.bacdcccccccc.',
      '.dddeeeeeeee..',
      '..qRRRRRRRq...',
      '..qqqqqqqqq...',
    ],
  },
  nail_gun: {
    ox: 5, oy: 6,
    held: [
      '..OOOOOOOOOOOb..',
      '.OoOOOOOOOOOObbb',
      'OoOOOdOOOOOOOabc',
      'OOOOOdOOOOOOnbbc',
      'OOOnOdnnnnnnnbbc',
      '.OOnOd.yyyyyy...',
      '.dddd..dcccccd..',
      '.dcccd.........',
      '.dccd..........',
      '.dddd..........',
    ],
    icon: [
      '..............',
      '..OOOOOOOOOb..',
      '.OoOOOOOOObbb.',
      'OoOOOdOOOOabc.',
      'OOOOdOOOOnbbc.',
      'OOnnOnnnnnbbc.',
      '.OOd.yyyyyy...',
      '.dcd.dcccd....',
      '.dcd..........',
      '.ddd..........',
    ],
  },
  laser_pointer: {
    ox: 2, oy: 1,
    held: [
      'bbaaaaaaaaaRr',
      'dccbbbbbbbbbq',
      'eddccccccccc.',
    ],
    icon: [
      '..............',
      '..............',
      '..........Rr..',
      '.........wRR..',
      '........abq...',
      '.......abc....',
      '......abc.....',
      '.....abc......',
      '....abc.......',
      '...bcc........',
      '...dc.........',
    ],
  },
  calculator: {
    ox: 2, oy: 5,
    held: [
      'dddddddddddd',
      'dccccccccccd',
      'dcGggggggGcd',
      'dcGgGGGGGGcd',
      'dcGGGGGGGGcd',
      'dccccccccccd',
      'dcawcwcwcRcd',
      'dcwacwacwcRd',
      'dcawcwcwcRcd',
      'dccccccccccd',
      'dddddddddddd',
    ],
    icon: [
      '..............',
      '.....dddddd...',
      '....dccccccd..',
      '....dcGggGcd..',
      '....dcGGGGcd..',
      '....dccccccd..',
      '....dcacacRd..',
      '....dcwcwcRd..',
      '....dcacacRd..',
      '....dcwcwcRd..',
      '.....dddddd...',
    ],
  },
  tape_gun: {
    ox: 3, oy: 8,
    held: build(15, 12, (p, rc, dc) => {
      rc(4, 0, 8, 6, 'T'); rc(4, 0, 8, 1, 't'); rc(4, 5, 8, 1, 'm'); rc(4, 1, 1, 4, 'm'); rc(11, 1, 1, 4, 'm'); rc(6, 1, 1, 4, 't'); rc(8, 1, 1, 4, 'm'); p(4, 0, '.'); p(11, 0, '.'); p(4, 5, '.'); p(11, 5, '.');
      p(5, 0, 'y');
      rc(2, 6, 12, 3, 'b'); rc(2, 6, 12, 1, 'a'); rc(2, 8, 12, 1, 'c'); p(2, 6, '.'); p(2, 8, '.');
      rc(1, 7, 3, 1, 'O'); rc(5, 7, 5, 1, 'O');
      rc(13, 5, 2, 4, 'a'); rc(14, 5, 1, 4, 'b'); p(14, 6, 'e'); p(14, 8, 'e'); p(13, 5, 'w');
      rc(10, 4, 3, 2, 'T'); p(12, 5, 'm');
      rc(2, 9, 4, 3, 'O'); rc(2, 9, 1, 3, 'o'); rc(5, 10, 1, 2, 'n'); p(2, 11, 'O'); rc(3, 10, 2, 1, 'o');
    }),
    icon: [
      '..............',
      '...tttttttt...',
      '..TTmTTmTTTm..',
      '..TTmTTmTTTm..',
      '..TTmTTmTTTm..',
      '..mmmmmmmmmm..',
      '..bbbbbbbbbba.',
      '..bOOOObOOOca.',
      '..bbbbbbbbbbc.',
      '..OO.cccccc...',
      '.OoO..........',
      '.OOO..........',
    ],
  },
  confetti_cannon: {
    ox: 2, oy: 5,
    held: () => {
      const out: string[] = [];
      const light = 'rylp', mid = 'RYBP', dark = 'qujx';
      for (let y = 0; y < 11; y++) {
        const dy = Math.abs(y - 5);
        const x0 = 15 - 3 * (5 - dy);
        let row = '';
        for (let x = 0; x < 18; x++) {
          if (x >= 16) row += x === 16 ? 'a' : 'b';
          else if (x >= x0) { const k = Math.floor((x + (y >> 1)) / 3) % 4; row += (y < 5 ? light : y === 5 ? mid : dark)[k]; }
          else if (x <= 2 && dy <= 0 && x0 <= 0) row += 'c';
          else row += '.';
        }
        out.push(row);
      }
      return out;
    },
    icon: [
      '..............',
      '..........y.p.',
      '.......rr.....',
      '.....rrylbb.G.',
      '...rrylpabbb..',
      '..RYBPRYabb...',
      '.RYBPRYBb.....',
      '.qujxqu.......',
      '..dc..........',
      '..............',
    ],
  },
  mug: {
    ox: 1, oy: 3,
    held: [
      '...wWWWWWv',
      'bbb.WRRRWv',
      'b.bWWRYRWv',
      'b.bWWRRRWv',
      'bbb.WWWWWv',
      '...VVVVVVv',
    ],
    icon: [
      '..............',
      '.....s.s......',
      '......s.s.....',
      '...wWWWWWWv...',
      '...WWWWWWWv.bb',
      '...WRRRRRWvb.b',
      '...WRYRYRWvb.b',
      '...WRRRRRWvb.b',
      '...WWWWWWWv.bb',
      '....VVVVVVv...',
    ],
  },
  monitor: {
    ox: 2, oy: 6,
    held: [
      '.wbbbbbbbbbbbbbb',
      'bddddddddddddddc',
      'bdBBBBBBBBBBBBdc',
      'bdBllBBBBBBBBBdc',
      'cdBlBBBBBBBBBBdc',
      'cdBBBBBBBBBBjBdc',
      'cbdBBBBBBBBjjBdc',
      'cdBBBBBBBBBBBBdc',
      'bddddddddddddddc',
      '.bbbbbbbbbbbbbc.',
      '..cc..........',
    ],
    icon: [
      '..............',
      '..wbbbbbbbbbc.',
      '..bddddddddbc.',
      '..bdBBBBBBldc.',
      '..bdBllBBBBdc.',
      '..bdBlBBBBBdc.',
      '..bdBBBBBjjdc.',
      '..bdBBBBjjBdc.',
      '..bddddddddbc.',
      '..bbbbbbbbbbc.',
      '.....bbbb.....',
      '....bcccbb....',
    ],
  },
  potted_plant: {
    ox: 2, oy: 5,
    held: [
      '......ghG.....',
      '.....gGGhG.g..',
      '...GGgGGhGGhG.',
      'nnnGGGgGhGGhh.',
      'OOnnGGGGhGGhG.',
      'oOOnGGhGGGGhh.',
      'OOOnnGGGGhGh..',
      'nnnn..hGGGh...',
      '.....ghGGG....',
      '..............',
    ],
    icon: [
      '......g.......',
      '....g.Gg..g...',
      '...gGGGhGGG...',
      '..gGGhGGGhGg..',
      '...GGGhGGGG...',
      '....hGGhGh....',
      '...oOOOOOOn...',
      '...OOOOOOOn...',
      '....OOOOOn....',
      '....OOOOOn....',
      '....nnnnnn....',
    ],
  },
  desk_phone: {
    ox: 2, oy: 5,
    held: [
      '..WWWWWWWWWWWW',
      '.WWWbbbbbbbbbW',
      'WWbbVVVVVVVVWW',
      'WVWWWWWWWWWWVv',
      'WVWdadadadaVVv',
      'WVWdadadadaVVv',
      'WVWdadadadaVVv',
      'WVWWWWWWWWWVVv',
      'vVVVVVVVVVVVvv',
    ],
    icon: [
      '..............',
      '.wWWWWWWWWWWV.',
      'WWbbbbbbbbbbWv',
      'WWWWWWWWWWWWVv',
      '.WVdadadadVVv.',
      '.WVdadadadVVv.',
      '.WVdadadadVVv.',
      '.WVWWWWWWWVVv.',
      '.vVVVVVVVVVvv.',
    ],
  },
  kettle: {
    ox: 3, oy: 5,
    held: build(15, 10, (p, rc) => {
      rc(4, 2, 8, 6, 'b'); rc(5, 1, 6, 1, 'a'); rc(4, 2, 1, 6, 'a'); rc(11, 2, 1, 6, 'c'); rc(5, 7, 7, 1, 'c');
      p(4, 2, '.'); p(11, 2, '.'); rc(5, 3, 2, 1, 'w'); p(5, 4, 'w');
      rc(6, 0, 3, 1, 'd'); p(7, 0, 'e');
      rc(12, 3, 2, 1, 'b'); rc(13, 2, 1, 2, 'b'); p(14, 2, 'a'); p(12, 4, 'c');
      rc(3, 8, 9, 2, 'e'); rc(4, 8, 7, 1, 'd');
      rc(0, 2, 3, 1, 'd'); rc(0, 2, 1, 5, 'd'); rc(0, 6, 3, 1, 'd'); p(2, 3, 'c');
    }),
    icon: [
      '..............',
      '.....ddd......',
      '..dd.abb......',
      '.d..abbbbbc...',
      '.d.abwbbbbbc..',
      '.d.abwbbbbbbc.',
      '.dd.abbbbbbc..',
      '..dabbbbbbcc..',
      '..daccccccc...',
      '...eeeeeee....',
    ],
  },
  energy_drink: {
    ox: 1, oy: 2,
    held: [
      'bbaaaaaaabb',
      'bwBBBBYBBbc',
      'bBBlBBYYBbc',
      'bwBBBBYBBbc',
      'bbcccccccbb',
    ],
    icon: [
      '..............',
      '.....bbbb.....',
      '....baaabb....',
      '....bBBBBc....',
      '....bBlBBc....',
      '....bBBYBc....',
      '....bBYYBc....',
      '....bBBYBc....',
      '....bBBBBc....',
      '....bBBBBc....',
      '....bcccbc....',
    ],
  },
  hole_punch: {
    ox: 2, oy: 4,
    held: [
      '...RRRRRRRRRR.',
      '..RrRRRRRRRRRb',
      '.dbbbbbbbbbbbb',
      'dcaaaaaaaaaaab',
      'dcbbbbbbbbbbbc',
      '.dcccccccccccc',
      '..dddddddddd..',
    ],
    icon: [
      '..............',
      '.....RRRRRRR..',
      '....RrRRRRRb..',
      '...dbbbbbbbb..',
      '..dcaaaaaaab..',
      '..dcbbbbbbbc..',
      '..dcbbWWbbbc..',
      '..dcccccccc...',
      '...dddddddd...',
    ],
  },
  toner_cartridge: {
    ox: 2, oy: 3,
    held: [
      'ddddddddddddd.',
      'dcccccccccccdd',
      'dcRRccGGccBBcd',
      'dcRrccGgccBlcd',
      'dcccccccccccdd',
      'eddddddddddde.',
      '.ee.........',
    ],
    icon: [
      '..............',
      '..............',
      '..dddddddddd..',
      '.dccccccccccd.',
      '.dcRRccGGBBcd.',
      '.dcRrccGgBlcd.',
      '.dccccccccccd.',
      '.deddddddddde.',
      '..eee....eee..',
    ],
  },
  paperweight: {
    ox: 4, oy: 4,
    held: [
      '..wllllz.',
      '.wlllllzz',
      'wlllllllz',
      'wllwlllzz',
      'llwwllzzz',
      'lllllzzzz',
      '.lllzzzz.',
      '..zzzzz..',
      '.........',
    ],
    icon: [
      '..............',
      '.....wl.......',
      '....wlllz.....',
      '...wlllllzz...',
      '..wllwllzzz...',
      '..lwwlllzzz...',
      '..lllllzzzz...',
      '...lllzzzz....',
      '....zzzzz.....',
      '..............',
    ],
  },
  coffee_tray: {
    ox: 2, oy: 5,
    held: [
      'TTTTTTTTTTTTTT',
      'TWWWWTWWWWTTTm',
      'TWvvWTWvvWTTTm',
      'TWWWWTWWWWTTTm',
      'TTTTTTTTTTTTTm',
      'TWWWWTWWWWTTTm',
      'TWvvWTWvvWTTTm',
      'TWWWWTWWWWTTTm',
      'mmmmmmmmmmmmmm',
    ],
    icon: [
      '..............',
      '..TTTTTTTTTT..',
      '.TWWWWTWWWWTm.',
      '.TWvvWTWvvWTm.',
      '.TWWWWTWWWWTm.',
      '.TTTTTTTTTTTm.',
      '.TWWWWTWWWWTm.',
      '.TWvvWTWvvWTm.',
      '.TWWWWTWWWWTm.',
      '..mmmmmmmmmm..',
    ],
  },
};

const cache = new Map<string, Sprite>();
const icache = new Map<string, HTMLCanvasElement>();

function def(id: string): WDef {
  return WEAPONS[id] ?? WEAPONS.fists;
}

export function hasWeaponArt(id: string): boolean { return id in WEAPONS; }

export function weaponHeld(id: string): Sprite {
  let s = cache.get(id);
  if (!s) {
    const d = def(id);
    const rows = typeof d.held === 'function' ? d.held() : d.held;
    s = heldSprite(rows, d.ox, d.oy, d.pal);
    cache.set(id, s);
  }
  return s;
}

export function weaponIconCanvas(id: string): HTMLCanvasElement {
  let c = icache.get(id);
  if (!c) {
    const d = def(id);
    c = iconTile(d.icon, d.ipal);
    icache.set(id, c);
  }
  return c;
}
