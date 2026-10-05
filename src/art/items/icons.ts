// 16x16 UI / reward / HUD icons (art drawn at up to 14x14, 1px outline added). Hand-authored ASCII pixel art.
import type { IconName } from '../items';
import type { IDef } from './gfx';
import { build } from './gfx';

export const ICONS_REWARD: Partial<Record<IconName, IDef>> = {
  // ---------------------------------------------------------------- reward previews
  reward_benefit: { rows: [
    '..............',
    '.wWWWWWWWWWWV.',
    '.WVWWWWWWWWVV.',
    '.WWVWWWWWWVWV.',
    '.WWWVWWWWVWWV.',
    '.WWWWVVVVWWWV.',
    '.WWWWWWW.yYY..',
    '.WWWWWWyYYYuY.',
    '.VVVVVVYYyYuY.',
    '........YYYuY.',
    '.........YuY..',
    '.........R.R..',
    '.........RRR..',
  ] },
  reward_cash: { rows: [
    '..............',
    '...gggggggggg.',
    '..gGGGGGGGGGh.',
    '.gggggggggGGh.',
    '.GGGGGGGGGGhh.',
    '.GgGGGggGGGGh.',
    '.GGGGgGGGGGhhY',
    '.GGgGGggGGhhyY',
    '.GGGGGGGGGhYYu',
    '.hhhhhhhhhhhuu',
    '..............',
  ] },
  reward_weapon: { rows: build(14, 14, (p, rc, _dc, ln) => {
    // bat (top-left to bottom-right)
    ln(1, 1, 11, 11, 'T', 2); ln(1, 1, 11, 11, 't', 1); ln(2, 2, 12, 12, 'm', 1);
    rc(0, 0, 2, 2, 'N'); p(0, 0, '.'); p(12, 12, 'N'); p(13, 13, 'N');
    // blade (top-right to bottom-left), drawn on top
    ln(12, 1, 5, 8, 'b', 2); ln(13, 2, 6, 9, 'c', 1); ln(12, 1, 5, 8, 'w', 1); p(13, 0, 'w'); p(12, 0, 'a');
    ln(2, 7, 7, 12, 'Y', 1); ln(3, 7, 8, 12, 'u', 1);
    ln(5, 9, 1, 13, 'Y', 1); ln(6, 10, 2, 13, 'N', 1);
  }) },
  reward_heal: { rows: [
    '....cccccc....',
    '....c....c....',
    '.wWWWWWWWWWWV.',
    '.WWWWRRRWWWWV.',
    '.WWWWRrRWWWWV.',
    '.WRRRRrRRRRWV.',
    '.WRrrrrrrrRWV.',
    '.WRRRRRRRRRWV.',
    '.WWWWRRRWWWWV.',
    '.WWWWRRRWWWWV.',
    '.VVVVVVVVVVVv.',
  ] },
  reward_rage: { rows: [
    '....qqqqqq....',
    '..qqRrrRRRqq..',
    '.qRRRRRRRRRRq.',
    '.qRddRRRRddRq.',
    'qRRRddRRddRRRq',
    'qRRWWdRRdWWRRq',
    'qRRWeWRRWeWRRq',
    'qRRRWWRRWWRRRq',
    'qRRRRRRRRRRRRq',
    '.qRRdddddddRq.',
    '.qRRdWdWdWdRq.',
    '..qqRdddddRqq.',
    '....qqqqqq....',
  ] },
  reward_desk_item: { rows: [
    '..dddddd......',
    '.dbaaaabd.....',
    'dbabbbbbbd....',
    'ddddddddddc...',
    '.yyyyyyyyy.c..',
    '..yyyyyyy..c..',
    '...yyyyy...c..',
    '..........cc..',
    '..........c...',
    '..........c...',
    '....ddddddcd..',
    '...dccccccd...',
    '...dddddddd...',
  ] },
  reward_shop: { rows: build(14, 14, (p, rc, dc) => {
    rc(0, 2, 14, 10, 'c'); rc(1, 3, 12, 8, 'a'); rc(0, 2, 14, 1, 'b'); rc(0, 2, 1, 10, 'b'); rc(1, 11, 13, 1, 'd'); rc(13, 3, 1, 8, 'd');
    p(0, 2, '.'); p(13, 2, '.'); p(0, 11, '.'); p(13, 11, '.');
    dc(5, 7, 3.8, 'V'); dc(5, 7, 3.3, 'W'); dc(5, 7, 2.2, 'V'); dc(5, 7, 1.6, 'O');
    p(4, 6, 'o'); p(5, 6, 'o'); p(6, 8, 'G'); p(4, 8, 'g'); p(6, 7, 'R');
    dc(10.5, 7, 2.6, 'W'); dc(10.5, 7, 1.7, 'm'); p(10, 6, 'T'); rc(12, 6, 2, 2, 'V'); p(13, 6, '.'); p(13, 7, '.');
  }) },
  reward_event: { rows: [
    '..............',
    '..BBBBBBBBBB..',
    '.BlBBBBBBBBBj.',
    '.BBBBWWWWBBBj.',
    '.BBBWWBBWWBBj.',
    '.BBBBBBBWWBBj.',
    '.BBBBBBWWBBBj.',
    '.BBBBBWWBBBBj.',
    '.BBBBBBBBBBBj.',
    '..jjjjBBjjjj..',
    '.....jBj......',
    '......j.......',
  ] },
  reward_treasure: { rows: [
    '..............',
    '.bbbbbbbbbbbb.',
    '.baaaaaaaaaac.',
    '.bacccccccdac.',
    '.bacYYYYYYdac.',
    '.bacccccccdac.',
    '.baaaaaaaaaac.',
    '.bacccccccdac.',
    '.bacYYYYYYdac.',
    '.bacccccccdac.',
    '.bddddddddddc.',
    '.dd........dd.',
  ] },
  reward_challenge: { rows: [
    '.....bbbb.....',
    '.....bccb.....',
    '....dbbbbd.R..',
    '..qqRRRRRRqqR.',
    '.qRRWWWWWWRRq.',
    '.qRWWWWdWWWRq.',
    '.RRWWWWdWWWRq.',
    '.RRWWWWdddWRq.',
    '.RRWWWWWWWWRq.',
    '.qRWWWWWWWWRq.',
    '..qRRWWWWRRq..',
    '....qqqqqq....',
  ] },
  reward_elite: { rows: [
    '......yY......',
    '......YY......',
    '.....yYYu.....',
    'yyyyyYYYYYYuuu',
    '.yYYYYYYYYYYu.',
    '..uYYYddYYYu..',
    '...uYYddYYu...',
    '...YYYYYYYYu..',
    '..YYYuYYuYYYu.',
    '..YYu....uYYu.',
    '.uYu......uYu.',
  ] },
  reward_director: { rows: [
    '..............',
    '..............',
    '.yYYYYYYYYYYu.',
    '.YyyyyyyyyyyY.',
    '.YuddddddddduY',
    '.YudYYYYYYYdYu',
    '.YuddddddddduY',
    '.YyyyyyyyyyyY.',
    '.uYYYYYYYYYYu.',
    '...uuuuuuuu...',
    '..dddddddddd..',
  ] },
  reward_boss: { rows: [
    '.Y...Y..Y...Y.',
    '.YY.YYYYYY.YY.',
    '.uYYYYYYYYYYu.',
    '..wwwwwwwwww..',
    '.wWWWWWWWWWWV.',
    '.WWeeWWWWeeWV.',
    '.WWeRWWWWeRWV.',
    '.WWWWWddWWWWV.',
    '..WWWWddWWWV..',
    '...WdWdWdWV...',
    '...VVVVVVVV...',
  ] },
};

// ---------------------------------------------------------------- departments (benefit providers): distinct colour + shape + emblem
export const ICONS_DEPT: Partial<Record<IconName, IDef>> = {
  // IT: blue rounded-square chip with a lightning bolt
  dept_it: { rows: [
    '.jjjjjjjjjjjj.',
    'jBlllBBBBBBBBj',
    'jBlBBBBBBBBBBj',
    'jBBBBBBBBBYyBj',
    'jBBBBBBBBYyYBj',
    'jBBBBBBBYyYBBj',
    'jBBBBBBYYYYYBj',
    'jBBBBBBBBYyBBj',
    'jBBBBBBBYyBBBj',
    'jBBBBBBYYBBBBj',
    'jBBBBBYBBBBBBj',
    'jBBBBBBBBBBBBj',
    'jBBBBBBBBBBBBj',
    '.jjjjjjjjjjjj.',
  ] },
  dept_facilities: { rows: build(14, 14, (p, rc, dc, ln) => {
    dc(7, 7, 7, 'n'); dc(7, 7, 6.2, 'O'); p(3, 3, 'o'); p(4, 2, 'o'); p(5, 2, 'o'); p(2, 4, 'o');
    ln(3, 11, 8, 6, 'W', 2); ln(4, 12, 9, 7, 'V', 1);
    dc(9.5, 4.5, 3.2, 'W'); dc(11, 3, 1.7, 'O'); rc(10, 1, 2, 3, 'O'); rc(11, 2, 3, 2, 'O');
    p(7, 3, 'w'); p(8, 2, 'w'); dc(3.8, 10.2, 1, 'O');
  }) },
  dept_sales: { rows: build(14, 14, (p, rc, dc, ln) => {
    dc(7, 7, 7, 'q'); dc(7, 7, 6.2, 'R'); p(3, 3, 'r'); p(4, 2, 'r'); p(5, 2, 'r'); p(2, 4, 'r');
    ln(3, 10, 9, 4, 'W', 2); ln(4, 11, 10, 5, 'V', 1);
    rc(7, 2, 5, 2, 'W'); rc(10, 2, 2, 5, 'W'); p(11, 2, 'w');
  }) },
  dept_marketing: { rows: build(14, 14, (p, rc, dc, ln) => {
    dc(7, 7, 7, 'x'); dc(7, 7, 6.2, 'P'); ln(3, 2, 8, 1, 'p', 1); ln(1, 5, 2, 3, 'p', 1);
    for (let x = 3; x <= 9; x++) { const half = 1 + Math.floor((x - 3) * 0.6); rc(x, 7 - half, 1, half * 2 + 1, 'W'); p(x, 7 - half, 'w'); p(x, 7 + half, 'V'); }
    rc(10, 3, 1, 9, 'a'); rc(11, 3, 1, 9, 'b'); p(10, 3, '.'); p(11, 3, '.'); p(10, 11, '.'); p(11, 11, '.');
    rc(3, 7, 1, 1, 'e'); rc(4, 10, 2, 3, 'e'); rc(4, 10, 1, 2, 'd'); rc(3, 6, 1, 3, 'V');
    p(12, 5, 'y'); p(12, 9, 'y'); p(13, 7, 'y');
  }) },
  dept_finance: { rows: [
    '....hhhhhh....',
    '..hhGggGGGhh..',
    '.hGGGGWWGGGGh.',
    '.hGGGWGGWGGGh.',
    'hGGGGWGGGGGGGh',
    'hGGGWWWWGGGGGh',
    'hGGGGWGGGGGGGh',
    'hGGGWGGGGWGGGh',
    '.hGWWWWWWWGGh.',
    '.hGGGGGGGGGGh.',
    '..hhGGGGGGhh..',
    '....hhhhhh....',
  ] },
  // Legal: teal shield with scales of justice
  dept_legal: { rows: [
    '.QQQQQQQQQQQQ.',
    '.QzzZZZZZZZZQ.',
    '.QzZZZWZZZZZQ.',
    '.QZZWWWWWZZZQ.',
    '.QZZZZWZZZZZQ.',
    '.QZWZZWZZWZZQ.',
    '.QZWWZWZWWZZQ.',
    '..QZZZWZZZZQ..',
    '..QZZWWWZZZQ..',
    '...QZZZZZZQ...',
    '....QZZZZQ....',
    '.....QQQQ.....',
  ] },
  // HR: warm pink heart badge
  dept_hr: { rows: [
    '..............',
    '..nnn....nnn..',
    '.nSSSn..nSSSn.',
    '.nSSSSnnSSSSn.',
    '.nSwSSSWSSSSn.',
    '.nSSSSWWWSSSn.',
    '.nSSSSSWSSSsn.',
    '..nSSSSSSSsn..',
    '...nSSSSSsn...',
    '....nSSSsn....',
    '.....nSsn.....',
    '......nn......',
  ], pal: { S: '#f08aa0', s: '#c85878', n: '#8c3450', w: '#ffd6e0' } },
  dept_executive: { rows: build(14, 14, (p, rc, dc) => {
    dc(7, 7, 7, 'u'); dc(7, 7, 6.2, 'Y'); p(3, 3, 'y'); p(4, 2, 'y'); p(5, 2, 'y'); p(2, 4, 'y');
    rc(3, 3, 1, 3, 'W'); rc(7, 3, 1, 3, 'W'); rc(11, 3, 1, 3, 'W'); rc(4, 5, 1, 1, 'W'); rc(6, 5, 1, 1, 'W'); rc(8, 5, 1, 1, 'W'); rc(10, 5, 1, 1, 'W');
    rc(3, 6, 9, 2, 'W'); rc(3, 8, 9, 2, 'V'); rc(3, 8, 9, 1, 'a');
    p(5, 7, 'R'); p(7, 7, 'B'); p(9, 7, 'R'); p(3, 3, 'w'); p(7, 3, 'w'); p(11, 3, 'w');
  }) },
};
