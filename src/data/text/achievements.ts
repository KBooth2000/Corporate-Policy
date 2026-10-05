export interface Achievement {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Early gameplay
  { id: 'first_blood', name: 'First Blood', desc: 'Defeat your first enemy.' },
  { id: 'floor_one', name: 'Ground Floor', desc: 'Reach Floor 5.' },
  { id: 'halfway_there', name: 'Halfway There', desc: 'Reach Floor 10.' },
  { id: 'mid_tower', name: 'Middle Management', desc: 'Reach Floor 15.' },
  { id: 'penthouse', name: 'Executive Suite', desc: 'Reach Floor 20.' },

  // Boss defeats
  { id: 'facilities_done', name: 'Facilities Terminated', desc: 'Defeat the Facilities Manager.' },
  { id: 'sales_done', name: 'Always Be Losing', desc: 'Defeat the Head of Sales.' },
  { id: 'compliance_done', name: 'Policy Violation', desc: 'Defeat the Head of Compliance.' },
  {
    id: 'ceo_defeated',
    name: 'The Penthouse Dream',
    desc: 'Defeat the CEO. Ending unlocked.',
  },

  // Execution types
  { id: 'defenestration_one', name: 'A Brief Flight', desc: 'Execute an enemy by defenestration.' },
  {
    id: 'defenestration_fifty',
    name: 'Defenestration Speedrun',
    desc: 'Throw 50 enemies out of windows.',
  },
  { id: 'photocopier', name: 'Print Shop', desc: 'Execute an enemy with a photocopier.' },
  { id: 'server_rack', name: 'Electrified', desc: 'Execute an enemy on a server rack.' },
  { id: 'shredder', name: 'Shredded Review', desc: 'Execute an enemy with an industrial shredder.' },
  { id: 'microwave', name: 'Microwaved', desc: 'Execute an enemy in a microwave.' },
  { id: 'hand_dryer', name: 'Blown Away', desc: 'Execute an enemy with a hand dryer.' },

  // Environmental kills
  { id: 'breach_one', name: 'Wall Breaker', desc: 'Breach a wall by throwing an enemy through it.' },
  { id: 'breach_five', name: 'Structural Damage', desc: 'Breach 5 walls.' },
  { id: 'merge_rooms', name: 'Open Plan Office', desc: 'Merge rooms by breaching a wall.' },
  { id: 'hazard_kill', name: 'Health & Safety', desc: 'Kill an enemy using environmental hazards.' },
  { id: 'sprinkler_stun', name: 'Fire Alarm', desc: 'Activate sprinklers and stun enemies.' },
  { id: 'printer_boom', name: 'Toner Explosion', desc: 'Explode a printer with an enemy nearby.' },

  // Rage and combat
  { id: 'rage_full', name: 'Unstoppable', desc: 'Fill Rage completely.' },
  { id: 'rage_ten', name: 'Serial Rager', desc: 'Use Rage 10 times in one run.' },
  { id: 'no_damage', name: 'Unscathed', desc: 'Complete a floor without taking damage.' },
  { id: 'rageless', name: 'Composed', desc: 'Complete a floor without using Rage.' },
  {
    id: 'flawless_run',
    name: 'Perfect Performance',
    desc: 'Defeat CEO without taking damage.',
    hidden: true,
  },

  // Starting roles
  { id: 'office_worker_win', name: 'Standard Issue', desc: 'Win a run as Office Worker.' },
  { id: 'temp_unlock', name: 'Temporary Status', desc: 'Unlock Temp role (reach floor 6).' },
  { id: 'temp_win', name: 'Freelance Victory', desc: 'Win a run as Temp.' },
  { id: 'night_cleaner_unlock', name: 'Night Shift', desc: 'Unlock Night Cleaner (100 hazard kills).' },
  { id: 'night_cleaner_win', name: 'Custodian\'s Vengeance', desc: 'Win a run as Night Cleaner.' },
  { id: 'contractor_unlock', name: 'Contractor Status', desc: 'Unlock Contractor (beat Head of Sales).' },
  { id: 'contractor_win', name: 'Gig Economy', desc: 'Win a run as Contractor.' },
  { id: 'ex_employee_unlock', name: 'Former Staff', desc: 'Unlock Ex-Employee (beat CEO once).' },
  { id: 'ex_employee_win', name: 'Permanent Rage', desc: 'Win a run as Ex-Employee.' },

  // Progression and meta
  { id: 'daily_run', name: 'Daily Briefing', desc: 'Complete the daily seeded run.' },
  { id: 'first_unlock', name: 'Unlocked Potential', desc: 'Spend Annual Leave on an unlock.' },
  { id: 'synergy_gain', name: 'Synergy', desc: 'Gain a synergy benefit.' },
  {
    id: 'synergy_five',
    name: 'Synergised',
    desc: 'Gain 5 synergy benefits in one run.',
  },
  { id: 'desk_item_five', name: 'Desk Jockey', desc: 'Carry 5 Desk Items at once.' },
  { id: 'corridor_shop', name: 'Retail Therapy', desc: 'Visit a corridor shop.' },
  { id: 'event_survived', name: 'Social Navigation', desc: 'Complete an event favourably.' },
  {
    id: 'event_chaos',
    name: 'Chaos Agent',
    desc: 'Sabotage an event and survive.',
  },
  { id: 'treasure_room', name: 'Stationery Bounty', desc: 'Clear a treasure room.' },
  { id: 'challenge_clear', name: 'Bonus Round', desc: 'Clear a challenge room.' },
  { id: 'lift_ambush', name: 'Ambushed', desc: 'Survive a lift ambush.' },

  // Promotion system
  {
    id: 'promoted_kill',
    name: 'Promoted Enemy Terminated',
    desc: 'Defeat a promoted enemy.',
  },
  {
    id: 'promoted_three',
    name: 'Termination Spree',
    desc: 'Terminate 3 promoted enemies.',
  },

  // Gore and difficulty
  { id: 'gore_off_win', name: 'Gore-Free', desc: 'Win with gore toggle off.' },
  { id: 'assist_off_win', name: 'No Adjustments', desc: 'Win with Workplace Adjustments off.' },
  { id: 'hard_mode', name: 'Performance Review', desc: 'Use a Performance Review modifier.' },
  { id: 'multiple_modifiers', name: 'Stacking Penalties', desc: 'Use 3 Performance Review modifiers.' },

  // Humor and weird achievements
  { id: 'per_my_last_email', name: 'Per My Last Email', desc: 'Hear that phrase jargon 100 times.' },
  {
    id: 'hostile_work_environment',
    name: 'Hostile Work Environment',
    desc: 'Defeat 5 enemies in one room.',
  },
  {
    id: 'exceeds_expectations',
    name: 'Exceeds Expectations',
    desc: 'Deal 500 total damage with Rage active.',
  },
  {
    id: 'culture_fit',
    name: 'Culture Fit',
    desc: 'Gain all synergies from a department.',
  },
  { id: 'under_budget', name: 'Under Budget', desc: 'Beat a floor using no Petty Cash.' },
  { id: 'cash_rich', name: 'Cash Rich', desc: 'Hold 1000 Petty Cash.' },
  {
    id: 'annual_leave_stacked',
    name: 'Veteran',
    desc: 'Earn 100 Annual Leave across all runs.',
  },
  {
    id: 'execution_enthusiast',
    name: 'Execution Enthusiast',
    desc: 'Perform 20 executions in one run.',
  },
  { id: 'first_synergy', name: 'Breakthrough', desc: 'Gain your first synergy bonus.' },
  {
    id: 'all_archetypes_seen',
    name: 'Nemesis Collection',
    desc: 'Encounter all 20 enemy archetypes.',
  },
  {
    id: 'corporate_ladder',
    name: 'Career Advancement',
    desc: 'Reach 3 different floors without using stairs.',
  },
  {
    id: 'full_arsenal',
    name: 'Everything Hurts',
    desc: 'Carry a melee, ranged, and throwable simultaneously.',
  },
  {
    id: 'budget_conscious',
    name: 'Penny Pincher',
    desc: 'Spend no Petty Cash in an entire run.',
  },
  {
    id: 'wealth_builder',
    name: 'Rich Beyond Measure',
    desc: 'Accumulate 5000 Annual Leave total.',
  },
  { id: 'elevator_speed_run', name: 'Vertical Express', desc: 'Reach floor 20 using only lift exits.' },
  { id: 'corridor_explorer', name: 'Hallway Navigation', desc: 'Clear 5 corridor events successfully.' },
  { id: 'breach_master', name: 'Structural Warfare', desc: 'Breach 10 walls in one run.' },
  { id: 'weapon_collector', name: 'Arsenal Builder', desc: 'Find 100 unique weapons across all runs.' },
  { id: 'culture_survivor', name: 'Indoctrination Resistance', desc: 'Hear the same bark 50 times.' },
];
