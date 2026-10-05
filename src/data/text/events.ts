export type EventEffect =
  | 'heal_small'
  | 'heal_full'
  | 'lose_hp_small'
  | 'lose_hp_large'
  | 'gain_cash_small'
  | 'gain_cash_large'
  | 'lose_cash'
  | 'gain_benefit'
  | 'gain_desk_item'
  | 'gain_weapon_rare'
  | 'curse_marked'
  | 'rage_full_next'
  | 'reveal_weakness'
  | 'nothing'
  | 'spawn_elite_fight'
  | 'shield_up'
  | 'max_hp_up'
  | 'max_hp_down'
  | 'free_reroll'
  | 'annual_leave_small'
  | 'gamble_cash';

export interface EventOption {
  label: string;
  outcome: string;
  effect: EventEffect;
  cost?: { cash?: number; hp?: number };
}

export interface GameEvent {
  id: string;
  title: string;
  theme?: string;
  intro: string;
  options: EventOption[];
}

export const EVENTS: GameEvent[] = [
  {
    id: 'photocopier_fortune',
    title: 'Photocopier Fortune',
    intro: 'The photocopier beeps. A fortune printout emerges. Is this luck?',
    options: [
      {
        label: 'Read the fortune',
        outcome: 'A prophecy about your damage output. Oddly accurate.',
        effect: 'gain_weapon_rare',
      },
      {
        label: 'Ignore it',
        outcome: 'The fortune blows away. Nothing changes.',
        effect: 'nothing',
      },
      {
        label: 'Jam it deeper',
        outcome: 'The copier explodes. Fragments everywhere.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'team_building_trust_fall',
    title: 'Team-Building Exercise',
    intro: 'Your team wants to build trust. They want you to fall backwards.',
    options: [
      {
        label: 'Fall and trust',
        outcome: 'They catch you. Morale rises. So does your confidence.',
        effect: 'shield_up',
      },
      {
        label: 'Refuse to fall',
        outcome: 'Team cohesion suffers. You stand alone.',
        effect: 'nothing',
      },
      {
        label: 'Push them instead',
        outcome: 'Chaos. Combat ensues.',
        effect: 'spawn_elite_fight',
      },
    ],
  },
  {
    id: 'leaving_do_cake',
    title: 'Leaving Do in the Kitchen',
    intro: 'A colleague is leaving. A cake sits on the counter. It smells like vanilla.',
    options: [
      {
        label: 'Eat a slice',
        outcome: 'Sugar rush. You feel revitalised.',
        effect: 'heal_small',
      },
      {
        label: 'Skip it',
        outcome: 'No one notices you leaving anyway.',
        effect: 'nothing',
      },
      {
        label: 'Take the whole cake',
        outcome: 'Petty theft. But it\'s sweet.',
        effect: 'gain_cash_small',
      },
    ],
  },
  {
    id: 'mandatory_fun_raffle',
    title: 'Mandatory Fun Raffle',
    intro: 'HR hosts a raffle. Three prizes. Your odds are clear. (They are not.)',
    options: [
      {
        label: 'Buy a ticket',
        outcome: 'You win a desk plant. Thrilling.',
        effect: 'gain_desk_item',
        cost: { cash: 5 },
      },
      {
        label: 'Skip the raffle',
        outcome: 'No ticket. No luck. No plant.',
        effect: 'nothing',
      },
      {
        label: 'Rig the raffle',
        outcome: 'You "win" a gift card. HR is suspicious.',
        effect: 'gain_cash_large',
      },
    ],
  },
  {
    id: 'suggestion_box',
    title: 'Suggestion Box',
    intro: 'A locked box on the wall. "Your ideas matter." Do they?',
    options: [
      {
        label: 'Submit a suggestion',
        outcome: 'It is never read. But you tried.',
        effect: 'nothing',
      },
      {
        label: 'Ignore it',
        outcome: 'The box remains sealed. So does the company mind.',
        effect: 'nothing',
      },
      {
        label: 'Break it open',
        outcome: 'Shredded ideas scatter. Some cash falls out.',
        effect: 'gain_cash_small',
      },
    ],
  },
  {
    id: 'secret_santa',
    title: 'Secret Santa Sign-Up',
    intro: 'White elephant time. A budget of £10. Expectations are low.',
    options: [
      {
        label: 'Participate genuinely',
        outcome: 'You receive a mug. Generic. But well-meaning.',
        effect: 'heal_small',
      },
      {
        label: 'Decline',
        outcome: 'Awkward. You stand apart.',
        effect: 'nothing',
      },
      {
        label: 'Gift something chaotic',
        outcome: 'A laughing fit. HR is not amused.',
        effect: 'rage_full_next',
      },
    ],
  },
  {
    id: 'wellness_pod',
    title: 'Wellness Pod Available',
    intro: 'A massage chair sits in the wellness room. "For your benefit."',
    options: [
      {
        label: 'Use the pod',
        outcome: 'Blissful. Your shield regenerates.',
        effect: 'shield_up',
      },
      {
        label: 'Pass on it',
        outcome: 'The pod is for others. You move on.',
        effect: 'nothing',
      },
      {
        label: 'Break it',
        outcome: 'Sparks fly. You feel oddly energised.',
        effect: 'rage_full_next',
      },
    ],
  },
  {
    id: 'smoking_shelter',
    title: 'The Smoking Shelter',
    intro: 'Colleagues huddle outside, heating lamps glowing. Gossip flows.',
    options: [
      {
        label: 'Join them',
        outcome: 'Overhear intel. You learn a secret.',
        effect: 'reveal_weakness',
      },
      {
        label: 'Walk past',
        outcome: 'No drama. No knowledge.',
        effect: 'nothing',
      },
      {
        label: 'Confront them',
        outcome: 'Escalation. Weapons drawn.',
        effect: 'spawn_elite_fight',
      },
    ],
  },
  {
    id: 'lost_property',
    title: 'Lost Property Claim',
    intro: 'A phone, a lanyard, and a shoe. Which is yours?',
    options: [
      {
        label: 'Claim the phone',
        outcome: 'Dead battery. But data remains. You gain a phone upgrade.',
        effect: 'gain_weapon_rare',
      },
      {
        label: 'Claim the lanyard',
        outcome: 'A fresh corporate glow. You feel executive.',
        effect: 'shield_up',
      },
      {
        label: 'Leave it all',
        outcome: 'Ownership is ambiguous. Ownership is free.',
        effect: 'nothing',
      },
    ],
  },
  {
    id: 'stationery_amnesty',
    title: 'Stationery Amnesty',
    intro: 'Return your borrowed supplies. No questions asked. (Lie.)',
    options: [
      {
        label: 'Return everything',
        outcome: 'Compliance raises your standing. Minor heal.',
        effect: 'heal_small',
      },
      {
        label: 'Hide your stash',
        outcome: 'The pens are yours. No healing, but freedom.',
        effect: 'nothing',
      },
      {
        label: 'Return defective items',
        outcome: 'A gift card appears. Compensation for defects.',
        effect: 'gain_cash_small',
      },
    ],
  },
  {
    id: 'fire_drill_signup',
    title: 'Fire Drill Sign-Up',
    intro: 'The warden needs evacuation leads. Volunteer?',
    options: [
      {
        label: 'Volunteer',
        outcome: 'Responsibility given. You leave safely. Next floor guaranteed.',
        effect: 'annual_leave_small',
      },
      {
        label: 'Decline',
        outcome: 'Let others lead. You follow.',
        effect: 'nothing',
      },
      {
        label: 'Sabotage the drill',
        outcome: 'Chaos. The alarm stays true. Combat spawns.',
        effect: 'spawn_elite_fight',
      },
    ],
  },
  {
    id: 'office_plant_funeral',
    title: 'Office Plant Funeral',
    intro: 'A potted plant died. The team gathers. A moment of silence.',
    options: [
      {
        label: 'Attend respectfully',
        outcome: 'Morale restored through shared grief.',
        effect: 'shield_up',
      },
      {
        label: 'Ignore it',
        outcome: 'The plant goes to compost. Unmourned.',
        effect: 'nothing',
      },
      {
        label: 'Rescue the plant',
        outcome: 'It lives. A desk item is born.',
        effect: 'gain_desk_item',
      },
    ],
  },
  {
    id: 'unattended_laptop',
    title: 'Unattended Laptop',
    intro: 'A laptop sits alone on a desk. Still warm. Screen unlocked.',
    options: [
      {
        label: 'Leave it alone',
        outcome: 'Someone returns for it. Integrity maintained.',
        effect: 'nothing',
      },
      {
        label: 'Lock the screen',
        outcome: 'You are a good person. Bad luck for you.',
        effect: 'nothing',
      },
      {
        label: 'Transfer funds',
        outcome: 'The account bleeds money. Into yours.',
        effect: 'gamble_cash',
      },
    ],
  },
  {
    id: 'vending_machine_jam',
    title: 'Vending Machine Jam',
    intro: 'Your snack is stuck. Mechanical cruelty.',
    options: [
      {
        label: 'Rock it gently',
        outcome: 'The snack falls. Sustenance gained.',
        effect: 'heal_small',
      },
      {
        label: 'Walk away',
        outcome: 'The machine keeps your money. Bitter.',
        effect: 'lose_cash',
        cost: { cash: 10 },
      },
      {
        label: 'Tilt it hard',
        outcome: 'The machine tilts. It crashes. The guard arrives.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'coffee_descaling',
    title: 'Coffee Machine Descaling',
    intro: 'The machine is out of service. "Descaling in progress." For how long?',
    options: [
      {
        label: 'Wait for coffee',
        outcome: 'The machine works. Caffeine flows. You are refreshed.',
        effect: 'heal_small',
      },
      {
        label: 'Use instant',
        outcome: 'Inferior. But functional.',
        effect: 'nothing',
      },
      {
        label: 'Force the machine',
        outcome: 'Descaling fluid everywhere. Burns. But you steal the espresso.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'bring_dog_to_work',
    title: 'Bring Your Dog to Work Day',
    intro: 'Dogs everywhere. Chaos. Joy. Confusion.',
    options: [
      {
        label: 'Pet the dogs',
        outcome: 'Petting raises morale. The dogs bite no one today.',
        effect: 'shield_up',
      },
      {
        label: 'Ignore them',
        outcome: 'The dogs do not care about you.',
        effect: 'nothing',
      },
      {
        label: 'Play aggressively',
        outcome: 'The dogs interpret your energy. Chaos. Bites happen.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'expense_claim_audit',
    title: 'Expense Claim Audit',
    intro: 'Finance is auditing Q2 claims. Yours are under review.',
    options: [
      {
        label: 'Submit honestly',
        outcome: 'Reimbursement granted. Clean conscience.',
        effect: 'gain_cash_small',
      },
      {
        label: 'Fight the audit',
        outcome: 'Standoff. The claim withers.',
        effect: 'nothing',
      },
      {
        label: 'Inflate claims',
        outcome: 'Fraud detected. But the cash flows through.',
        effect: 'gamble_cash',
      },
    ],
  },
  {
    id: 'thought_leadership_post',
    title: 'Thought Leadership Opportunity',
    intro: 'HR invites you to share your thoughts. On company culture. Publicly.',
    options: [
      {
        label: 'Post something positive',
        outcome: 'LinkedIn does its thing. Likes flow. Shallow validation.',
        effect: 'gain_cash_small',
      },
      {
        label: 'Decline',
        outcome: 'Your silence is noted. As is your lack of social presence.',
        effect: 'nothing',
      },
      {
        label: 'Post the truth',
        outcome: 'Viral. Wrong kind of viral. HR notices.',
        effect: 'rage_full_next',
      },
    ],
  },
  {
    id: 'away_day_coach',
    title: 'Away Day Coach Journey',
    intro: 'A coach awaits to take the team to a retreat. Long ride. Singing.',
    options: [
      {
        label: 'Go on the coach',
        outcome: 'Team bonding happens. Shield replenished.',
        effect: 'shield_up',
      },
      {
        label: 'Stay behind',
        outcome: 'Alone. But free of team songs.',
        effect: 'nothing',
      },
      {
        label: 'Sabotage the coach',
        outcome: 'It breaks down. Stranded. But the team is furious.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'the_quiet_room',
    title: 'The Quiet Room',
    intro: 'A space for respite. Minimal stimulation. Maximum peace.',
    options: [
      {
        label: 'Meditate',
        outcome: 'Silence heals. Your shield regenerates.',
        effect: 'shield_up',
      },
      {
        label: 'Use it for paperwork',
        outcome: 'Productivity. Boredom. No healing.',
        effect: 'nothing',
      },
      {
        label: 'Scream',
        outcome: 'The quiet room absorbs your rage. Next fight amplified.',
        effect: 'rage_full_next',
      },
    ],
  },
  {
    id: 'birthday_celebration',
    title: 'Birthday Celebration',
    intro: 'Someone\'s birthday. A cake. Enthusiasm.',
    options: [
      {
        label: 'Celebrate',
        outcome: 'Joy shared. Your wellbeing rises.',
        effect: 'heal_small',
      },
      {
        label: 'Decline',
        outcome: 'You miss the cake. No loss.',
        effect: 'nothing',
      },
      {
        label: 'Crash the party',
        outcome: 'Disruption. Conflict. But you get the cake.',
        effect: 'lose_hp_small',
      },
    ],
  },
  {
    id: 'quarterly_review_early',
    title: 'Surprise Quarterly Review',
    intro: 'Your manager ambushes you with an early review. Unexpected.',
    options: [
      {
        label: 'Face it honestly',
        outcome: 'Feedback stings. But growth paths open.',
        effect: 'max_hp_up',
      },
      {
        label: 'Defer it',
        outcome: 'The review waits. Awkwardness remains.',
        effect: 'nothing',
      },
      {
        label: 'Challenge them',
        outcome: 'Confrontation escalates. Combat spawns.',
        effect: 'spawn_elite_fight',
      },
    ],
  },
  {
    id: 'lunch_theft',
    title: 'Stolen Lunch from the Fridge',
    intro: 'Your lunch is gone. The fridge is full of suspects.',
    options: [
      {
        label: 'Let it go',
        outcome: 'Acceptance. Hunger. But dignity intact.',
        effect: 'lose_hp_small',
      },
      {
        label: 'Steal someone else\'s',
        outcome: 'Retribution. Balance restored. No healing.',
        effect: 'nothing',
      },
      {
        label: 'Poison the fridge',
        outcome: 'Chaos. Sirens. But no one steals again.',
        effect: 'spawn_elite_fight',
      },
    ],
  },
];
