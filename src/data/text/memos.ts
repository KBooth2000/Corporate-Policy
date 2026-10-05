export interface Memo {
  title: string;
  from: string;
  body: string;
}

export const MEMOS: Memo[] = [
  // Policy memos (satirical)
  {
    title: 'Culture Realignment Programme — Mandatory Attendance',
    from: 'HR Department',
    body: 'All staff must attend the Culture Realignment Programme. Non-attendance is noted. Attendance is our organisational family. Please smile while attending.',
  },
  {
    title: 'The Kitchen Incident',
    from: 'Facilities Management',
    body: 'Someone has been leaving teabags in the sink. This is unacceptable. Please dispose of teabags in the compost bin or take them home.',
  },
  {
    title: 'Bandwidth Allocation Q3',
    from: 'Operations',
    body: 'We are oversubscribed on deliverables. Please reduce discretionary activities to improve project delivery bandwidth.',
  },
  {
    title: 'Hot Desking Implementation',
    from: 'Facilities',
    body: 'Personal possessions will be removed nightly. Your desk is company property. Your personalisation space is a framed photo (4×6 max).',
  },
  {
    title: 'Mandatory Fun — Team Day Attendance',
    from: 'HR',
    body: 'Next Friday: off-site team-building. Attendance is mandatory. Please confirm enthusiasm to your line manager.',
  },
  {
    title: 'Email Etiquette Reminder',
    from: 'Communications',
    body: 'Do not use all caps. Do not use exclamation marks excessively. Do not challenge senior leadership in email.',
  },
  {
    title: 'Printer Paper Rationing',
    from: 'Finance',
    body: 'Paper usage is up 12%. Please print double-sided only. Digital-first culture is mandated.',
  },
  {
    title: 'Lift Etiquette Policy 2.3',
    from: 'Facilities',
    body: 'Lifts are allocated by rank. Please wait for the appropriate lift. Running alongside an executive is not permitted.',
  },
  {
    title: 'Workspace Boundaries',
    from: 'Compliance',
    body: 'Do not discuss salary with colleagues. Do not discuss working hours. Do not discuss leave with colleagues.',
  },
  {
    title: 'Annual Performance Cycle',
    from: 'HR',
    body: 'Your value to the organisation will be assessed quarterly using 360-degree feedback. Prepare accordingly.',
  },
  {
    title: 'Lanyard Replacement Policy',
    from: 'Security',
    body: 'Lanyards are £2.50 per replacement. Lost or defaced lanyards incur a charge. Glow-in-the-dark lanyards are executive only.',
  },
  {
    title: 'Mandatory Wellness Workshops',
    from: 'Wellbeing',
    body: 'Mindfulness: Tuesdays 6am. Meditation: Thursdays 6pm. Attendance boosts annual leave balance. (After core hours only.)',
  },
  {
    title: 'Parking Space Allocations',
    from: 'Facilities',
    body: 'Reserved spaces: C-suite, Directors, Managers (alphabetically). General staff: overflow carpark, 10-minute walk.',
  },
  {
    title: 'Meeting Room Booking Ethics',
    from: 'Admin',
    body: 'Meeting room usage is tracked. Recurring meetings without clear agendas reflect poorly on your planning capability.',
  },
  {
    title: 'Dress Code Compliance',
    from: 'HR',
    body: 'Business formal. Except Fridays (business casual). Except in Summer (casual but professional). Except executives (no rules).',
  },
  {
    title: 'Leave Approval Framework',
    from: 'HR',
    body: 'Annual leave requests are assessed on business need and team coverage. Last-minute requests are noted.',
  },
  {
    title: 'Quiet Floors Initiative',
    from: 'Facilities',
    body: 'Floors 11–13 are designated quiet. Please limit conversations to urgent matters. Laughing is permitted at management discretion.',
  },
  {
    title: 'Syndicate Breach Alert',
    from: 'IT Security',
    body: 'We detect your browsing habits. Please ensure all websites are work-related. Personal activity is flagged for review.',
  },
  {
    title: 'Maternity/Paternity Return Plan',
    from: 'HR',
    body: 'Welcome back! Your flexible working request has been noted. Core hours remain 9–5. Flex is 6–9am or after 5pm only.',
  },
  {
    title: 'Office Supplies Accountability',
    from: 'Finance',
    body: 'Each department gets 500 pens, 50 pads per quarter. Overage is deducted from your budget. Hoarding is audited.',
  },
  {
    title: 'Social Distancing Reminders',
    from: 'Facilities',
    body: 'Please maintain 2 metres from colleagues. The lift is a shared space. Proximity breeds culture.',
  },
  {
    title: 'Microwave Cleaning Roster',
    from: 'Facilities',
    body: 'A rota is posted. Your turn is noted. Failure to clean affects your team\'s standing.',
  },
  {
    title: 'Suggestion Box Results',
    from: 'HR',
    body: 'We received 47 suggestions. All have been reviewed. We will not be implementing any of them.',
  },
  {
    title: 'Executive Retreat (Attendance Mandatory)',
    from: 'CEO\'s Office',
    body: 'Join us for three days of team building. Full attendance expected. Casual wear. (No jeans.)',
  },
  {
    title: 'Hybrid Working Policy',
    from: 'Operations',
    body: 'Three days in office, two remote. Your team lead chooses which days. Toggle your location weekly.',
  },
  {
    title: 'Christmas Party Guidelines',
    from: 'HR',
    body: 'Festive attire encouraged. No religious decoration. Corporate colours only. Attendance is optional but observed.',
  },
  {
    title: 'Standing Desk Vouchers',
    from: 'Facilities',
    body: 'Staff at or above Grade 7 are eligible for £200 standing desk vouchers. Please apply with medical need documentation.',
  },
  {
    title: 'Code of Conduct Refresher',
    from: 'Compliance',
    body: 'Annual training is mandatory. You will be quizzed. Passing score: 80%. Failure results in mandatory coaching.',
  },
  {
    title: 'Recruitment Freeze',
    from: 'Finance',
    body: 'All headcount is frozen. Backfill vacancies with existing staff. (Salary not increased.)',
  },
  {
    title: 'Energy Efficiency Drive',
    from: 'Facilities',
    body: 'Please turn off lights, computers and monitors at end of day. Leaving equipment on is logged by floor.',
  },
  {
    title: 'Diversity and Inclusion Statement',
    from: 'HR',
    body: 'We are committed to diversity. Employees from diverse backgrounds should assimilate quickly.',
  },
  {
    title: 'Water Cooler Talk Guidelines',
    from: 'Compliance',
    body: 'Casual conversations are monitored. Please keep discussions work-related or risk flagging.',
  },
  {
    title: 'Keyboard Hygiene Protocol',
    from: 'Facilities',
    body: 'Keyboards are company property. Cleaning supplies must be approved. Unapproved cleaning voids the warranty.',
  },
  {
    title: 'Calendar Blocking Best Practices',
    from: 'Executive Assistant',
    body: 'Block your calendar for deep work. Executives will unblock it for meetings. No actually deep work occurs.',
  },
  {
    title: 'Commute Survey 2024',
    from: 'Facilities',
    body: 'We are surveying commute times. Longer commutes indicate dedication. Please submit via intranet.',
  },
  {
    title: 'Meeting Etiquette Refresh',
    from: 'Communications',
    body: 'Arrive early. Cameras on. Mute when not speaking. Never mention you\'re multitasking.',
  },
  {
    title: 'Office Dog Policy Update',
    from: 'HR',
    body: 'Dogs are welcome on designated days. Allergies are noted. No reasonable accommodation will be made.',
  },
  {
    title: 'Break Room Refrigerator Amnesty',
    from: 'Facilities',
    body: 'Friday: all unidentified containers will be removed. Label your food or lose it.',
  },
  {
    title: 'Slack Channel Guidelines',
    from: 'IT',
    body: 'Do not use Slack to complain. Do not use Slack privately. Slack records everything. Always.',
  },
  {
    title: 'Parking Validation Changes',
    from: 'Facilities',
    body: 'Validation now requires executive approval. Apply 48 hours in advance via form 77-B.',
  },
  {
    title: 'Flexible Working Policy Clarification',
    from: 'HR',
    body: 'Flexible working is flexible on our terms only. Core hours: 8am to 6pm daily.',
  },
  {
    title: 'Gender Neutral Bathroom Availability',
    from: 'Facilities',
    body: 'One stall on floor 7 is designated. Key must be requested from Security. Wait time: 20 minutes average.',
  },
  {
    title: 'Performance Bonus Eligibility Update',
    from: 'Finance',
    body: 'Bonuses for last year are under review. They may be redeployed to shareholder initiatives.',
  },
  {
    title: 'Workspace Decoration Policy',
    from: 'Facilities',
    body: 'Personal items must be removed nightly. Plants are forbidden (except executive office ferns).',
  },
  {
    title: 'Mentorship Program Sign-Up',
    from: 'HR',
    body: 'Mentorship improves retention. Your mentor is assigned at random. No refunds on mismatches.',
  },
  {
    title: 'Wellness App Roll-Out',
    from: 'Wellbeing',
    body: 'Download the app. It tracks your steps, heart rate and mood. Data is anonymised. (It is not.)',
  },
  {
    title: 'Conference Room Booking System',
    from: 'Admin',
    body: 'New system: book 48 hours in advance. All meetings are recorded. Casual use flagged.',
  },
  {
    title: 'Library Closure Notice',
    from: 'Facilities',
    body: 'The library is closed for "modernisation." Book access is now digital. Password is "Culture2024".',
  },
  {
    title: 'Procurement Card Suspension',
    from: 'Finance',
    body: 'Your card is suspended pending receipt reconciliation. Resubmit receipts from 2019 Q3.',
  },
  {
    title: 'Summer Dress Code',
    from: 'HR',
    body: 'Summer casual is permitted. This means removing your jacket. Nothing else changes.',
  },
  {
    title: 'Vending Machine Restock Schedule',
    from: 'Facilities',
    body: 'Restocking occurs Thursdays 2–4pm. Use the machines before then. After then, they are empty.',
  },
  {
    title: 'Badge Renewal Reminder',
    from: 'Security',
    body: 'Badges expire annually. Renewal takes 10 business days. Plan accordingly.',
  },
  {
    title: 'Overtime Compensation Policy',
    from: 'HR',
    body: 'Overtime is encouraged but unpaid. Time in lieu approved on management discretion.',
  },
  {
    title: 'Team Photo Day Postponed',
    from: 'Communications',
    body: 'New date: TBC. Professional attire mandatory. Smiling mandatory. Authenticity optional.',
  },
  {
    title: 'Supplier Audit Results',
    from: 'Compliance',
    body: 'Our suppliers are ethical. We have audited their ethics. They passed. Barely.',
  },
  {
    title: 'Exit Interview Scheduling',
    from: 'HR',
    body: 'Departing staff: exit interviews are mandatory. Honest feedback will be noted.',
  },
  {
    title: 'Quarterly Business Review Prep',
    from: 'Finance',
    body: 'QBR is next week. All numbers must align with narrative. Adjust data accordingly.',
  },
  {
    title: 'Confidentiality Reminder',
    from: 'Legal',
    body: 'Confidentiality is paramount. Leaking internal emails is gross misconduct. We know who leaked.',
  },
  {
    title: 'New Hire Onboarding Flow',
    from: 'HR',
    body: 'Day 1: Welcome video. Day 2: Culture programme. Day 3: Disillusionment. Day 4: Acceptance.',
  },
  {
    title: 'Open Microphone Town Hall',
    from: 'CEO Office',
    body: 'Next month: CEO addresses staff. Questions are welcome. Hostile questions will be noted.',
  },
  {
    title: 'Ergonomic Assessment Waitlist',
    from: 'Wellbeing',
    body: 'Back pain complaints have doubled. Assessments: 12-week wait. In the meantime, sit up straight.',
  },
  {
    title: 'Travel Policy Tightening',
    from: 'Finance',
    body: 'All flights must be economy. Hotels: budget chain only. Meals: no alcohol. Culture: maximum.',
  },
  {
    title: 'Software License Audit',
    from: 'IT',
    body: 'We are auditing software. Unlicensed software is terminated. Please confess preemptively.',
  },
  {
    title: 'Parking Lot Resurfacing',
    from: 'Facilities',
    body: 'Lot will be closed for 6 weeks. No spaces are being added. Carpool or take transit.',
  },
  {
    title: 'Accessibility Improvements Planned',
    from: 'Facilities',
    body: 'We are making the building more accessible. Elevators: being serviced. Ramps: under review.',
  },
  {
    title: 'Contractor Onboarding Streamlined',
    from: 'HR',
    body: 'Contractors no longer get office keys. They sit in designated areas. No water fountains nearby.',
  },
  {
    title: 'Meeting Effectiveness Survey',
    from: 'Operations',
    body: 'Half our meetings are deemed wasteful. But we will hold a meeting to discuss this.',
  },
  {
    title: 'Freelancer Engagement Framework',
    from: 'Procurement',
    body: 'Freelancers must sign our standard contract. Late payment: 90 days. As standard.',
  },
  {
    title: 'Workplace Safety Training Mandatory',
    from: 'Health & Safety',
    body: 'Annual safety training is 8 hours. It is entirely online. Nothing you learn applies.',
  },
  {
    title: 'Conflict of Interest Disclosure',
    from: 'Compliance',
    body: 'Disclose any conflicts. Disclosure does not excuse the conflict. It just documents it.',
  },
  {
    title: 'Subscription Service Audit',
    from: 'Finance',
    body: 'We are reviewing subscriptions. Many will be terminated. Notify your team mates.',
  },
  {
    title: 'Remote Work Equipment Policy',
    from: 'IT',
    body: 'Remote equipment must be returned within 24 hours of termination. Or it will be pursued legally.',
  },
  {
    title: 'New Hire Buddy System',
    from: 'HR',
    body: 'Each new hire is assigned a buddy. Your buddy is whoever\'s in your calendar. Good luck.',
  },
  {
    title: 'Feedback Culture Initiative',
    from: 'Operations',
    body: 'We want to hear your ideas! Feedback is collected, reviewed, and filed away.',
  },
  {
    title: 'Intranet Portal Update',
    from: 'IT',
    body: 'New portal rolling out. All bookmarks are invalid. Passwords reset. Links are broken.',
  },
  {
    title: 'Sick Leave Policy Overhaul',
    from: 'HR',
    body: 'Sick leave now requires medical certification on day 1. Colds count as illnesses.',
  },
  {
    title: 'Cyber Security Awareness Training',
    from: 'IT Security',
    body: 'Phishing emails will be sent. Clicking them counts against you. Click none of them.',
  },
  {
    title: 'Salary Review Process',
    from: 'HR',
    body: 'Reviews are merit-based. Your merit is assessed against market benchmarks. You lose.',
  },
  {
    title: 'Expense Report Deadline Extended',
    from: 'Finance',
    body: 'Submit expenses within 30 days of travel. We may ask for additional documentation. Then deny them.',
  },
  {
    title: 'Anti-Harassment Policy Reminder',
    from: 'HR',
    body: 'Harassment will not be tolerated. Report it to HR. It will be handled confidentially. Or not.',
  },
  {
    title: 'Health Insurance Changes',
    from: 'Benefits',
    body: 'Coverage is being reduced. Costs are staying the same. Deductibles are tripling.',
  },
  {
    title: 'Volunteer Day Sign-Ups',
    from: 'CSR',
    body: 'Annual volunteer day: charity of our choice. Not your choice. Attendance boosts your rating.',
  },
  {
    title: 'Filing System Overhaul',
    from: 'Admin',
    body: 'Physical files are being digitised. Old system is being shredded. Archived emails: permanent.',
  },
  {
    title: 'Workplace Accommodation Requests',
    from: 'HR',
    body: 'Accommodations cost money. Your request is being evaluated. Budget is limited. Very.',
  },
  {
    title: 'Copier Maintenance Schedule',
    from: 'Facilities',
    body: 'Copiers will be serviced Tuesday 9am-5pm. No copying during service. Plan accordingly.',
  },
  {
    title: 'Team Building Feedback Survey',
    from: 'HR',
    body: 'How was last month\'s trust fall? Feedback will be collected and ignored.',
  },
  {
    title: 'Supplies Ordering System Change',
    from: 'Procurement',
    body: 'New system requires manager approval. Approval takes 2 weeks. Post-its can wait.',
  },
  {
    title: 'Office Move Announcement',
    from: 'Facilities',
    body: 'We are relocating to a smaller building next month. Your desk may not fit. Downsizing culture.',
  },
  {
    title: 'Commuter Benefits Program',
    from: 'HR',
    body: 'Public transport subsidies available. Amount: £5 per month. Enthusiasm: not included.',
  },
  {
    title: 'Workspace Audit Results',
    from: 'Facilities',
    body: 'Auditors found clutter. Personal items must be removed immediately or disposed of.',
  },
  {
    title: 'Software Training Certificates',
    from: 'Learning & Development',
    body: 'Certificate programs are available! Cost: £500. Reimbursement: after employment ends.',
  },
  {
    title: 'Customer Feedback Program',
    from: 'Operations',
    body: 'Customers will call you directly. Calls are monitored. Feedback is collected. Changes: none.',
  },
  {
    title: 'Holiday Calendar Blocked Dates',
    from: 'HR',
    body: 'Certain weeks are blocked: Christmas (4 weeks), Easter (2 weeks), your wedding (denied).',
  },
  {
    title: 'Performance Plan Initiation',
    from: 'HR',
    body: 'You are on a performance plan. You have 90 days to improve. It will not be enough.',
  },
  {
    title: 'Whistleblower Hotline Launch',
    from: 'Compliance',
    body: 'Confidential reporting available! Callers: never truly anonymous. Report sparingly.',
  },
  {
    title: 'Workspace Return-to-Office',
    from: 'CEO Office',
    body: 'All staff return to office 5 days per week. Remote work policy: cancelled.',
  },
  {
    title: 'Sustainability Initiative: Paper Reduction',
    from: 'Operations',
    body: 'Going digital to save trees. All documents printed triple-spaced on larger paper.',
  },
  {
    title: 'Donation Matching Campaign',
    from: 'Corporate Social Responsibility',
    body: 'We match charitable donations! Match rate: 0%. But your donation is noted.',
  },
  {
    title: 'Workspace Personalization Guidelines',
    from: 'Facilities',
    body: 'Plants are permitted. Pot must be beige. Soil must be contained. Personality prohibited.',
  },
  {
    title: 'Lunch & Learn Series',
    from: 'HR',
    body: 'Lunch is not provided. Learning: mandatory. Duration: your lunch hour.',
  },
  {
    title: 'Performance Appraisal Form Update',
    from: 'HR',
    body: 'New form has 47 sections. Some are redundant. Your manager will rate you on vibes.',
  },
  {
    title: 'Harassment Reporting Survey',
    from: 'HR',
    body: 'Confidential survey: have you experienced harassment? Responses are reviewed by management.',
  },
  {
    title: 'Office Coffee Machine Replacement',
    from: 'Facilities',
    body: 'Old machine is broken. New machine: vending-style capsules. Cost: £2 per cup.',
  },
  {
    title: 'Annual Leave Carryover Policy',
    from: 'HR',
    body: 'Unused leave is forfeited. Exceptions require executive approval. Approval: never granted.',
  },
  {
    title: 'Email Retention Policy',
    from: 'IT',
    body: 'Emails older than 1 year are deleted automatically. Archive important messages. Never.',
  },
  {
    title: 'Presentation Skills Workshop',
    from: 'Corporate Communications',
    body: 'Free training available! Register now. You will be evaluated.',
  },
  {
    title: 'Office Supplies Inventory Check',
    from: 'Facilities',
    body: 'Pens disappear mysteriously. You are suspects. Pen rationing begins tomorrow.',
  },
  {
    title: 'Workspace Noise Complaint',
    from: 'Facilities',
    body: 'Complaints received about keyboard volume. Please type quietly. Or use soft touch.',
  },
  {
    title: 'Team Lunch Cancelled',
    from: 'HR',
    body: 'Budget constraints require cancellation. Catered team lunch: postponed indefinitely.',
  },
  {
    title: 'Accessibility Audit Findings',
    from: 'HR',
    body: 'Building is partially inaccessible. Accommodations under review. Stairs: still required.',
  },
  {
    title: 'Contractor Extension Approval',
    from: 'Finance',
    body: 'Contract extensions require board approval. Approval time: 8 weeks. Contract: ends in 4.',
  },
  {
    title: 'Parking Space Reassignments',
    from: 'Facilities',
    body: 'Spaces are being reassigned by seniority. New assignment: much farther away.',
  },
  {
    title: 'Mandatory Harassment Training Update',
    from: 'HR',
    body: 'Training is now online. Completion required by Friday. It is Thursday.',
  },
  {
    title: 'Intranet Password Reset Required',
    from: 'IT Security',
    body: 'All passwords expire today. New passwords must be changed every 30 days.',
  },
  {
    title: 'Stationery Budget Approved',
    from: 'Finance',
    body: 'Annual budget: £50 per employee. Purchases above that flagged for review.',
  },
  {
    title: 'Team Member Appreciation Day',
    from: 'HR',
    body: 'Appreciation day is next week! Thank someone today. Gratitude is free.',
  },
  {
    title: 'Meeting Room Availability Crisis',
    from: 'Admin',
    body: 'Demand exceeds supply. Meetings moved to virtual. But WiFi is also unavailable.',
  },
  {
    title: 'Retirement Planning Seminar',
    from: 'Benefits',
    body: 'Free seminar! Pension: minimal. Retirement: 47 years away.',
  },
  {
    title: 'Office Plant Care Assignment',
    from: 'Facilities',
    body: 'Someone must care for office plants. Volunteers: none. Assignment: mandatory.',
  },
  {
    title: 'Keyboard Shortcut Training',
    from: 'IT',
    body: 'Productivity training: use keyboard shortcuts. They have changed in the new system.',
  },
  {
    title: 'Calendar Synchronisation Issues',
    from: 'IT Support',
    body: 'Meeting invitations delayed. Some arriving 3 days late. Plan accordingly.',
  },
  {
    title: 'Restructuring Announcement Date Set',
    from: 'CEO',
    body: 'Restructuring will be announced next month. Positions will be eliminated. Retraining: TBC.',
  },
  {
    title: 'Cost-Cutting Initiative Q4',
    from: 'Finance',
    body: 'Expenses are too high. All non-essential spending frozen. Coffee budget: essential.',
  },
  {
    title: 'Mentee Matching Program Launch',
    from: 'HR',
    body: 'New mentorship matching! Mentors assigned by lottery. Quality: unverified.',
  },
  {
    title: 'Office Etiquette Reminder',
    from: 'Facilities',
    body: 'Please flush toilets. Wash hands. Do not bring strong foods. Courtesy culture.',
  },
  {
    title: 'Compliance Training Completion Rates',
    from: 'Compliance',
    body: 'Completion rate: 62%. Missing 38% will be flagged. Then reminded. Then nothing happens.',
  },
  {
    title: 'Expense Reimbursement Denial Notice',
    from: 'Finance',
    body: 'Your Q2 expenses were denied. Reason: insufficient documentation. Resubmit with more.',
  },
  {
    title: 'Productivity Metrics Dashboard Launch',
    from: 'Operations',
    body: 'New dashboard tracks your output. You will be compared to peers. Publicly.',
  },
  {
    title: 'Internal Mobility Programme',
    from: 'HR',
    body: 'Transfer to a different role! Process: apply now. Approval: unlikely.',
  },
  {
    title: 'Office Holiday Decorations Guidelines',
    from: 'Facilities',
    body: 'Decorations permitted. Non-religious themes only. Culture themes encouraged.',
  },
];

export const TIPS: Memo[] = [
  {
    title: 'Dash Invulnerability Frames',
    from: 'GAMEPLAY TIP',
    body: 'Dash has invulnerability frames and passes through enemies. Use it to escape corners or dodge incoming attacks.',
  },
  {
    title: 'Grab Mechanics',
    from: 'GAMEPLAY TIP',
    body: 'Grab staggered or low-HP enemies (below 25% health). Grabbed enemies can be thrown, used as projectiles, or executed.',
  },
  {
    title: 'Breaching Walls',
    from: 'GAMEPLAY TIP',
    body: 'Throw enemies through partition walls to breach rooms. Debris stuns enemies briefly. Merging rooms creates harder fights but grants breach bonus rewards.',
  },
  {
    title: 'Environmental Executions',
    from: 'GAMEPLAY TIP',
    body: 'Grab enemies next to execution objects (photocopier, shredder, window) for instant kills and massive Rage gain.',
  },
  {
    title: 'Photocopier Mastery',
    from: 'GAMEPLAY TIP',
    body: 'Photocopier executions create printouts that scatter as floor decals. Hilarious and devastating.',
  },
  {
    title: 'Weapon Durability',
    from: 'GAMEPLAY TIP',
    body: 'All weapons break. Every enemy drops their weapon on death. Scavenge frequently to maintain loadout.',
  },
  {
    title: 'Rage System Overview',
    from: 'GAMEPLAY TIP',
    body: 'Rage fills from damage taken, kills, and hearing corporate jargon. It decays outside combat and cannot be stockpiled between floors.',
  },
  {
    title: 'Rage Cannot Wait',
    from: 'GAMEPLAY TIP',
    body: 'Do not wait for Rage to fill. Use it immediately for duration, damage and execution benefits. Waiting loses momentum.',
  },
  {
    title: 'Wellbeing Shield',
    from: 'GAMEPLAY TIP',
    body: 'Your Wellbeing shield absorbs damage before HP. It regenerates after a short time without taking damage.',
  },
  {
    title: 'Stair Landings Heal',
    from: 'GAMEPLAY TIP',
    body: 'Taking the stairs to the next floor grants a small heal. The lift skips floors but risks an ambush.',
  },
  {
    title: 'Lift Ambush Strategy',
    from: 'GAMEPLAY TIP',
    body: 'The lift has a 25% chance of ambush. Ambushes are short, high-reward arena fights. Prepare for a fight.',
  },
  {
    title: 'Exit Preview Icons',
    from: 'GAMEPLAY TIP',
    body: 'Every exit shows a reward preview: weapon, upgrade, currency, healing or special event. Choose strategically.',
  },
  {
    title: 'Corridor Exits',
    from: 'GAMEPLAY TIP',
    body: 'Corridors lead to shops, events, treasures or challenges. You make horizontal progress but no floor advancement.',
  },
  {
    title: 'Building Your Build',
    from: 'GAMEPLAY TIP',
    body: 'Collect Benefits (department perks) and Desk Items (passives) to synergise your playstyle. Stacking related perks is powerful.',
  },
  {
    title: 'Shop Mechanics',
    from: 'GAMEPLAY TIP',
    body: 'Shops accept Petty Cash. Buy Benefits, weapons, heals and rerolls. Reroll prices increase each use in a shop.',
  },
  {
    title: 'Petty Cash Economy',
    from: 'GAMEPLAY TIP',
    body: 'Unspent Petty Cash converts to Annual Leave at 10:1 at run end. Efficiency build: hoard and convert.',
  },
  {
    title: 'Annual Leave Persistence',
    from: 'GAMEPLAY TIP',
    body: 'Annual Leave is kept on death. Every floor reached and boss killed grants permanent currency. It compounds.',
  },
  {
    title: 'Elite Floor Rewards',
    from: 'GAMEPLAY TIP',
    body: 'Elite floors have stronger enemies but reward rarity upgrades and currency bonuses. Risk/reward trade.',
  },
  {
    title: 'Boss Health Phases',
    from: 'GAMEPLAY TIP',
    body: 'Bosses have 3 phases. At 66% and 33% health, the arena changes. Watch the health bar for phase markers.',
  },
  {
    title: 'Boss Grab Windows',
    from: 'GAMEPLAY TIP',
    body: 'Bosses become grabbable at the end of each phase (stagger window). Grab for execution cutscene and phase transition.',
  },
  {
    title: 'Defenestration Bonuses',
    from: 'GAMEPLAY TIP',
    body: 'Throwing enemies out windows is iconic. Defenestration counts towards achievements and grants execution bonuses.',
  },
  {
    title: 'Stealth Is Not An Option',
    from: 'GAMEPLAY TIP',
    body: 'This is not a stealth game. Every floor has locked doors. You must clear every enemy to proceed.',
  },
  {
    title: 'Alarm Floors Explained',
    from: 'GAMEPLAY TIP',
    body: 'About 1 in 5 floors triggers an alarm. All doors open, all enemies hunt you. High risk, high reward.',
  },
  {
    title: 'Jargon Fills Rage',
    from: 'GAMEPLAY TIP',
    body: 'Hearing corporate jargon from enemies (barks) fills your Rage meter. Lean into it. It\'s your fuel.',
  },
  {
    title: 'Hazard Luring',
    from: 'GAMEPLAY TIP',
    body: 'Enemies react to hazards. Lure them into electrified water, printers or sprinklers. Hazards hurt everyone.',
  },
  {
    title: 'File Cabinet Toppling',
    from: 'GAMEPLAY TIP',
    body: 'Hit filing cabinets to make them fall. They create new cover and crush anyone in the way.',
  },
  {
    title: 'Water Cooler Synergy',
    from: 'GAMEPLAY TIP',
    body: 'Hit a water cooler, then electrify it via nearby cable. It becomes a hazard zone that stuns and slows.',
  },
  {
    title: 'Fire Extinguisher Blast',
    from: 'GAMEPLAY TIP',
    body: 'Fire extinguishers create knockback and smoke clouds. Enemies can\'t see through the smoke.',
  },
  {
    title: 'Printer Explosives',
    from: 'GAMEPLAY TIP',
    body: 'Heavy-hit a printer. It fuses and explodes after a short countdown. Area damage and setup opportunity.',
  },
  {
    title: 'Swivel Chair Ricochet',
    from: 'GAMEPLAY TIP',
    body: 'Kick swivel chairs. They roll and knock enemies down. Chain them for momentum.',
  },
  {
    title: 'Glass Partition Shatters',
    from: 'GAMEPLAY TIP',
    body: 'Damage or throw bodies through glass partitions. They shatter and cut anyone adjacent, applying bleed.',
  },
  {
    title: 'Ranged Weapon Ammo',
    from: 'GAMEPLAY TIP',
    body: 'Ranged weapons have limited ammo. Dropped weapons retain their ammo count. Manage ammunition carefully.',
  },
  {
    title: 'Throwables Are One-Shot',
    from: 'GAMEPLAY TIP',
    body: 'Thrown items (mugs, monitors, plants) deal high stagger but are single-use. Pick them up again if you need them.',
  },
  {
    title: 'Melee Combo Strings',
    from: 'GAMEPLAY TIP',
    body: 'Melee weapons chain combos up to 3 hits. Timing matters. Stagger during combos for advantage.',
  },
  {
    title: 'Aiming Projectiles',
    from: 'GAMEPLAY TIP',
    body: 'Aim with your right stick (or mouse). Ranged weapons fire in your aim direction. Lead moving targets.',
  },
  {
    title: 'Room Clear Rewards',
    from: 'GAMEPLAY TIP',
    body: 'Clearing a room grants currency and sometimes items. Chain clears for momentum bonuses.',
  },
  {
    title: 'Door Lock Mechanics',
    from: 'GAMEPLAY TIP',
    body: 'Doors lock when you enter a room. They unlock when all enemies in that room are dead. Plan room-to-room routes.',
  },
  {
    title: 'Back-Up Strategy',
    from: 'GAMEPLAY TIP',
    body: 'Corridors have width and angles. Use cover (desks, filing cabinets) to control sightlines. Don\'t get surrounded.',
  },
  {
    title: 'Execution Cutscene Toggle',
    from: 'GAMEPLAY TIP',
    body: 'Executions are 1–1.5 seconds. Toggle their frequency in settings: Always, First Time Only, or Off.',
  },
  {
    title: 'First Floor Is Forgiving',
    from: 'GAMEPLAY TIP',
    body: 'Act 1 is balanced for newcomers. Build confidence here. Acts 2–4 escalate significantly.',
  },
  {
    title: 'Seniority Tier Scaling',
    from: 'GAMEPLAY TIP',
    body: 'Enemies scale: Junior (starting act), Senior (one act later), Lead (two+ acts later). Later tiers are tougher.',
  },
  {
    title: 'Pool Blending Diversity',
    from: 'GAMEPLAY TIP',
    body: '70% of spawns are current-act enemies; 30% are earlier archetypes at higher seniority. Expect variety.',
  },
  {
    title: 'Elite Floor Warnings',
    from: 'GAMEPLAY TIP',
    body: 'Elite floor exits show an "elite" badge. These rooms have at least one elite enemy and better rewards.',
  },
  {
    title: 'Treasure Rooms Are Noloot',
    from: 'GAMEPLAY TIP',
    body: 'Treasure rooms have no combat. Walk in, grab the guaranteed upgrade, walk out. Simple.',
  },
  {
    title: 'Challenge Floors',
    from: 'GAMEPLAY TIP',
    body: 'Challenges impose restrictions (timed clear, no Rage, no ranged). Rewards are substantial if you succeed.',
  },
];
