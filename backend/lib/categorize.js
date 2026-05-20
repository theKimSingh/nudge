// Deterministic task categorization by keyword matching. Zero LLM cost.
// MUST stay in sync with src/features/todo/categorize.ts — same KEYWORDS,
// same ERRAND_OVERRIDE, same PRIORITY, same algorithm. The manual path uses
// the TS sibling; the voice path uses this module via executor.js.

const CATEGORY_IDS = [
  'meal',
  'exercise',
  'work',
  'study',
  'sleep',
  'selfcare',
  'errand',
  'social',
  'health',
  'other',
];

const KEYWORDS = {
  exercise: [
    'gym', 'workout', 'workouts', 'exercise', 'exercising', 'training', 'train', 'fitness',
    'cardio', 'hiit', 'crossfit', 'peloton', 'spin', 'spin class', 'barre', 'pilates',
    'yoga', 'stretch', 'stretching', 'mobility', 'dance', 'dance class', 'dancing', 'zumba',
    'martial arts', 'karate', 'judo', 'jiu jitsu', 'bjj', 'mma', 'boxing', 'kickboxing',
    'taekwondo', 'fencing', 'run', 'running', 'jog', 'jogging', 'sprint', 'sprints',
    'treadmill', '5k', '10k', 'half marathon', 'marathon', 'bike', 'biking', 'cycle', 'cycling',
    'ride', 'swim', 'swimming', 'pool', 'laps', 'lift', 'lifting', 'weights', 'weightlifting',
    'deadlift', 'squat', 'squats', 'bench', 'push ups', 'pushups', 'pull ups', 'pullups',
    'situps', 'crunches', 'hike', 'hiking', 'climb', 'climbing', 'bouldering', 'kayak',
    'kayaking', 'paddleboard', 'surf', 'surfing', 'ski', 'skiing', 'snowboard', 'snowboarding',
    'tennis', 'basketball', 'soccer', 'football', 'volleyball', 'baseball', 'golf', 'golfing',
    'badminton', 'ping pong', 'hockey', 'rugby', 'lacrosse', 'frisbee', 'walk', 'walking',
  ],
  sleep: [
    'sleep', 'sleeping', 'asleep', 'nap', 'napping', 'snooze', 'bed', 'bedtime', 'wake',
    'wake up', 'wakeup', 'waking up', 'rest', 'resting', 'rest day', 'wind down',
    'go to bed', 'sleep in', 'lights out',
  ],
  meal: [
    'breakfast', 'brunch', 'lunch', 'dinner', 'supper', 'snack', 'snacks', 'coffee',
    'espresso', 'latte', 'cappuccino', 'tea', 'smoothie', 'juice', 'meal', 'meals',
    'meal prep', 'eat', 'eating', 'cook', 'cooking', 'bake', 'baking', 'takeout',
    'takeaway', 'delivery', 'doordash', 'ubereats', 'grubhub', 'restaurant', 'cafe',
    'diner', 'pub', 'drinks', 'beer', 'wine', 'cocktail', 'pizza', 'sushi', 'ramen',
    'salad', 'sandwich', 'burrito', 'burger', 'tacos', 'pasta', 'food',
  ],
  health: [
    'doctor', 'doctors', 'dentist', 'dental', 'orthodontist', 'optometrist', 'eye doctor',
    'ophthalmologist', 'dermatologist', 'gp', 'primary care', 'gynecologist', 'obgyn',
    'urgent care', 'vet', 'veterinarian', 'therapy', 'therapist', 'psychiatrist',
    'psychologist', 'counseling', 'counselor', 'appointment', 'checkup', 'check up',
    'physical', 'blood test', 'blood work', 'lab', 'labs', 'xray', 'x ray', 'scan',
    'mri', 'ct scan', 'ultrasound', 'screening', 'mammogram', 'colonoscopy', 'pharmacy',
    'prescription', 'refill', 'meds', 'medication', 'medications', 'pill', 'pills',
    'vitamin', 'vitamins', 'supplement', 'supplements', 'injection', 'shot', 'vaccine',
    'vaccination', 'flu shot', 'allergy shot', 'chiropractor', 'acupuncture',
    'physical therapy', 'filling', 'root canal', 'surgery', 'operation', 'hospital',
    'clinic', 'er', 'emergency room',
  ],
  social: [
    'mom', 'mum', 'mommy', 'dad', 'daddy', 'mother', 'father', 'parents', 'sister',
    'brother', 'sis', 'bro', 'son', 'daughter', 'grandma', 'grandpa', 'granny',
    'grandparent', 'grandparents', 'cousin', 'cousins', 'aunt', 'uncle', 'niece',
    'nephew', 'husband', 'wife', 'partner', 'boyfriend', 'girlfriend', 'gf', 'bf',
    'spouse', 'fiance', 'fiancee', 'family', 'fam', 'friend', 'friends', 'bestie',
    'buddy', 'buddies', 'hangout', 'hang out', 'party', 'parties', 'get together',
    'gathering', 'mingle', 'date', 'date night', 'dating', 'anniversary', 'valentine',
    'happy hour', 'wedding', 'weddings', 'birthday', 'bday', 'baby shower',
    'bridal shower', 'bachelor party', 'bachelorette', 'reunion', 'dinner party',
    'housewarming', 'visit', 'visiting', 'meet up', 'meetup', 'catch up', 'catchup',
    'facetime', 'video chat',
  ],
  study: [
    'study', 'studying', 'learn', 'learning', 'revise', 'revising', 'school', 'college',
    'university', 'class', 'classes', 'lecture', 'lectures', 'seminar', 'tutorial',
    'course', 'courses', 'homework', 'assignment', 'assignments', 'problem set',
    'problem sets', 'pset', 'psets', 'essay', 'essays', 'paper', 'papers', 'thesis',
    'dissertation', 'exam', 'exams', 'test', 'tests', 'quiz', 'quizzes', 'midterm',
    'midterms', 'final', 'finals', 'sat', 'act', 'gre', 'gmat', 'lsat', 'mcat',
    'flashcards', 'anki', 'notes', 'textbook', 'chapter', 'research', 'library',
  ],
  work: [
    'work', 'working', 'meeting', 'meetings', 'standup', 'stand up', 'sync', 'syncs',
    '1 1', '1on1', 'one on one', 'all hands', 'allhands', 'town hall', 'kickoff',
    'kick off', 'retro', 'retrospective', 'planning', 'sprint', 'sprint planning',
    'demo', 'demos', 'email', 'emails', 'inbox', 'slack', 'teams', 'dm', 'dms',
    'respond', 'reply', 'replies', 'call', 'calls', 'phone call', 'conference call',
    'zoom', 'zoom call', 'gmeet', 'google meet', 'video call', 'project', 'projects',
    'deadline', 'deliverable', 'task', 'ticket', 'jira', 'linear', 'asana', 'notion',
    'code', 'coding', 'pr', 'prs', 'code review', 'pull request', 'merge', 'deploy',
    'debug', 'refactor', 'ship', 'commit', 'github', 'design', 'designs', 'mockup',
    'wireframe', 'prototype', 'figma', 'doc', 'docs', 'document', 'spec', 'specs',
    'writeup', 'write up', 'rfc', 'prd', 'brief', 'client', 'clients', 'customer',
    'sales', 'pitch', 'proposal', 'contract', 'interview', 'interviews', 'screening',
    'onsite', 'phone screen', 'deck', 'slides', 'presentation', 'presentations',
    'report', 'reports', 'audit', 'okrs', 'kpi', 'kpis',
  ],
  errand: [
    'errand', 'errands', 'pick up', 'picking up', 'pickup', 'drop off', 'dropping off',
    'dropoff', 'stop by', 'drop by', 'head to', 'grocery', 'groceries', 'grocery store',
    'supermarket', 'market', 'mall', 'shopping', 'shop', 'shopping center', 'store',
    'stores', 'target', 'costco', 'walmart', 'amazon', 'trader joes', 'whole foods',
    'safeway', 'kroger', 'cvs', 'walgreens', 'rite aid', 'home depot', 'lowes', 'ikea',
    'best buy', 'bank', 'atm', 'post office', 'mail', 'post', 'package', 'packages',
    'fedex', 'ups', 'usps', 'gas', 'gas station', 'fill up', 'car wash', 'oil change',
    'mechanic', 'dmv', 'court', 'irs', 'return', 'returns', 'dry cleaning', 'dry cleaner',
    'airport', 'flight', 'uber', 'lyft', 'taxi', 'bills', 'pay bills', 'taxes',
    'pay taxes', 'rent', 'pay rent',
  ],
  selfcare: [
    'shower', 'showering', 'bath', 'bathe', 'bathing', 'brush teeth', 'floss', 'flossing',
    'brushing teeth', 'skincare', 'makeup', 'getting ready', 'get ready', 'haircut',
    'hair cut', 'barber', 'salon', 'nails', 'manicure', 'pedicure', 'spa', 'massage',
    'facial', 'waxing', 'eyebrows', 'laundry', 'do laundry', 'clean', 'cleaning', 'tidy',
    'tidy up', 'tidying', 'organize', 'organizing', 'declutter', 'vacuum', 'vacuuming',
    'sweep', 'mop', 'dishes', 'do the dishes', 'wash dishes', 'meditate', 'meditation',
    'mindfulness', 'breathwork', 'breathing', 'journal', 'journaling', 'gratitude',
    'self care', 'selfcare',
  ],
  other: [],
};

const PRIORITY = [
  'exercise',
  'sleep',
  'meal',
  'health',
  'social',
  'study',
  'work',
  'errand',
  'selfcare',
];

const ERRAND_OVERRIDE = /\b(run\s+to|run\s+errands?)\b/;
// Course-code override: "CSE 480", "MATH 201", "ENGR 100", etc. Two-to-four
// letters followed by an optional space and 2-4 digits. Catches college-class
// titles that no keyword would otherwise pick up.
const COURSE_CODE_OVERRIDE = /\b[a-z]{2,4}\s?\d{2,4}\b/;

function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const PATTERNS = {};
for (const cat of PRIORITY) {
  PATTERNS[cat] = KEYWORDS[cat].map(
    (kw) => new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`),
  );
}

function inferCategory(rawTitle) {
  const t = normalize(rawTitle);
  if (!t) return 'other';
  if (ERRAND_OVERRIDE.test(t)) return 'errand';
  if (COURSE_CODE_OVERRIDE.test(t)) return 'study';
  for (const cat of PRIORITY) {
    if (PATTERNS[cat].some((re) => re.test(t))) return cat;
  }
  return 'other';
}

module.exports = { inferCategory, CATEGORY_IDS };
