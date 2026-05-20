-- Auto-categorization for tasks.
-- Stores one of 10 enum keys; the visual mapping (emoji + circle color) lives
-- in the frontend's CATEGORY_META module so visual redesigns don't need a
-- migration. CHECK constraint is the safety net if app code emits a bad value;
-- in practice both the manual path (categorize.ts) and voice path
-- (categorize.js / agent-supplied + resolveCategory) always set a valid value.

alter table public.tasks
  add column category text not null default 'other'
    check (category in (
      'meal','exercise','work','study','sleep',
      'selfcare','errand','social','health','other'
    ));

-- Backfill: assign categories to existing rows using the same keyword rules as
-- the TS/JS matchers. Order matches PRIORITY in categorize.ts plus the errand
-- override pre-pass. \m / \M are Postgres word-boundary anchors. We normalize
-- the title in-line so apostrophes/punctuation don't break boundary matching.
update public.tasks
set category = case
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(run to|run errands?)\M'
    then 'errand'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(gym|workout|workouts|exercise|exercising|training|fitness|cardio|hiit|crossfit|peloton|spin|barre|pilates|yoga|stretch|stretching|mobility|dance|dancing|zumba|karate|judo|bjj|mma|boxing|kickboxing|run|running|jog|jogging|sprint|sprints|treadmill|5k|10k|marathon|bike|biking|cycle|cycling|swim|swimming|laps|lift|lifting|weights|deadlift|squat|squats|bench|pushups|pullups|situps|crunches|hike|hiking|climb|climbing|bouldering|kayak|kayaking|surf|surfing|ski|skiing|snowboard|snowboarding|tennis|basketball|soccer|football|volleyball|baseball|golf|golfing|badminton|hockey|rugby|lacrosse|frisbee|walk|walking)\M'
    then 'exercise'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(sleep|sleeping|asleep|nap|napping|snooze|bed|bedtime|wake|wakeup|rest|resting)\M'
    then 'sleep'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(breakfast|brunch|lunch|dinner|supper|snack|snacks|coffee|espresso|latte|tea|smoothie|juice|meal|meals|eat|eating|cook|cooking|bake|baking|takeout|takeaway|doordash|ubereats|grubhub|restaurant|cafe|diner|pub|drinks|beer|wine|cocktail|pizza|sushi|ramen|salad|sandwich|burrito|burger|tacos|pasta|food)\M'
    then 'meal'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(doctor|doctors|dentist|dental|orthodontist|optometrist|ophthalmologist|dermatologist|gynecologist|obgyn|vet|veterinarian|therapy|therapist|psychiatrist|psychologist|counseling|counselor|appointment|checkup|physical|xray|mri|ultrasound|mammogram|colonoscopy|pharmacy|prescription|refill|meds|medication|medications|pill|pills|vitamin|vitamins|injection|vaccine|vaccination|chiropractor|acupuncture|filling|surgery|hospital|clinic)\M'
    then 'health'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(mom|mum|mommy|dad|daddy|mother|father|parents|sister|brother|son|daughter|grandma|grandpa|grandparent|grandparents|cousin|cousins|aunt|uncle|niece|nephew|husband|wife|partner|boyfriend|girlfriend|spouse|fiance|fiancee|family|friend|friends|bestie|buddy|buddies|hangout|party|parties|gathering|date|anniversary|valentine|happy hour|wedding|weddings|birthday|bday|reunion|housewarming|visit|visiting|meetup|catchup|facetime)\M'
    then 'social'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(study|studying|homework|lecture|lectures|seminar|tutorial|course|courses|assignment|assignments|pset|psets|essay|essays|paper|papers|thesis|dissertation|exam|exams|test|tests|quiz|quizzes|midterm|midterms|sat|act|gre|gmat|lsat|mcat|flashcards|anki|notes|textbook|chapter|research|library|class|classes)\M'
    then 'study'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(work|working|meeting|meetings|standup|sync|syncs|kickoff|retro|retrospective|sprint|demo|demos|email|emails|inbox|slack|call|calls|zoom|gmeet|project|projects|deadline|jira|asana|notion|code|coding|pr|prs|pull request|merge|deploy|debug|refactor|github|figma|mockup|wireframe|prototype|doc|docs|spec|specs|rfc|prd|client|clients|customer|sales|pitch|proposal|contract|interview|interviews|onsite|deck|slides|presentation|presentations|report|reports|audit|okrs|kpi|kpis)\M'
    then 'work'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(errand|errands|pickup|dropoff|grocery|groceries|supermarket|market|mall|shopping|shop|store|stores|target|costco|walmart|amazon|safeway|kroger|cvs|walgreens|home depot|lowes|ikea|bank|atm|post office|mail|package|packages|fedex|ups|usps|gas|car wash|oil change|mechanic|dmv|court|irs|returns|dry cleaning|dry cleaner|airport|flight|uber|lyft|taxi|bills|taxes|rent|pick up|drop off|stop by|drop by|head to)\M'
    then 'errand'
  when lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) ~ '\m(shower|showering|bath|bathe|bathing|brush teeth|floss|flossing|skincare|makeup|haircut|barber|salon|nails|manicure|pedicure|spa|massage|facial|waxing|eyebrows|laundry|tidy|organize|declutter|vacuum|sweep|mop|dishes|meditate|meditation|mindfulness|breathwork|journal|journaling|gratitude|selfcare)\M'
    then 'selfcare'
  else 'other'
end
where category = 'other';

create index tasks_user_category_idx on public.tasks (user_id, category);
