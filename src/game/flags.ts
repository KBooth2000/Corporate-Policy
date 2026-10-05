// Feature flags.
// Spec 5.6 legal gate: the full persistent Promotion system (memory, strengths/weaknesses, intel, Director bosses)
// is implemented but ships DISABLED until a patent freedom-to-operate opinion clears it (WB Games US2016279522A1).
// 'light' = the spec's fallback: a killer returns once with a title, no persistent memory or traits.
export const PROMOTION_MODE: 'light' | 'full' = 'light';
