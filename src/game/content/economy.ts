// Economy glue (spec 8.2): debt repayment from earnings, run-start role kit, next-floor event flags, and the expense claim at run end.
// Annual Leave itself belongs to the meta module: this file only stashes numbers on run.flags for it to read.
import { RUN_END_HOOKS, RUN_START_HOOKS } from '../registry';
import { BENEFITS } from '../content-info';
import { Rng } from '../../core/rng';
import { notify } from '../../ui/corpos';
import { icon } from '../../art/items';
import { S, floorInstallers, on, repayDebt, say } from './common';

/** Unspent Petty Cash converts to Annual Leave days at this many cash per day (spec 8.2: 10:1, tunable). */
export const EXPENSE_RATE = 10;

// Debt repayments come out of future earnings: every cash pickup pays down the Company Credit Card / Overdraft first.
floorInstallers.push((s) => {
  on(s, 'pickup', (e) => { if (e.kind === 'cash') repayDebt(s); });
});

// Event outcomes that act on the next floor (Marked curse, Stress gauge pre-filled)
floorInstallers.push((s) => {
  const f = s.run.flags;
  if (f.rageFullNext) {
    delete f.rageFullNext;
    s.player.rage = 100; s.player.rageReadyAnnounced = true;
    say(s, 'STRESS GAUGE FULL', '#ff6a4a');
  }
  if (f.markedNext) {
    delete f.markedNext;
    s.player.status.marked = 45;
    notify({ title: 'You have been Marked', body: 'The Auditor remembers you. +25% damage taken for a while.', kind: 'warn', icon: icon('warning') });
  }
});

// Role kit: the Night Cleaner starts with a Facilities Benefit (spec 7.3 / roles.csv). Idempotent across resumed runs.
RUN_START_HOOKS.push((s: S) => {
  const run = s.run;
  if (run.flags.cpKit) return;
  run.flags.cpKit = true;
  if (run.role === 'night_cleaner' && !run.benefits.some((b) => BENEFITS.find((d) => d.id === b.id)?.dept === 'facilities')) {
    const pool = BENEFITS.filter((d) => d.dept === 'facilities' && d.starter && !d.synergy);
    if (pool.length) run.benefits.push({ id: Rng.from(run.seed, 'kit').pick(pool).id, rarity: 0 });
  }
});

// Expense claim at run end (win or lose): net unspent Petty Cash -> Annual Leave at 10:1.
RUN_END_HOOKS.push((s: S) => {
  const run = s.run;
  const net = Math.max(0, run.pettyCash - run.debt);
  run.flags.expenseRate = EXPENSE_RATE;
  /** Days of Annual Leave from the expense claim. The meta module adds this to the profile. */
  run.flags.expenseLeave = Math.floor(net / EXPENSE_RATE);
  /** Extra days from events (annual_leave_small). The meta module adds this too. */
  run.flags.bonusLeave = Number(run.flags.bonusLeave ?? 0);
  /** Multiplier for Annual Leave earned this run (Annual Leave Request Form desk item). */
  run.flags.leaveMult = run.deskItems.includes('leave_request') ? 1.25 : 1;
});
