// DEV audit: run a handful of Kim's event-extraction cases through the ON-DEVICE
// Apple Foundation Model and log expected-vs-actual, so you can verify outputs
// are correct without speaking. Cases use a fixed anchor date (2026-05-20, a
// Wednesday) matching Kim's harness so the resolved dates are deterministic.
//
// NOTE: the model is ~70% accurate (Kim's measurement) — some cases CAN fail.
// A failure here reflects the model's ceiling, not a pipeline bug; the point is
// to see real on-device outputs.

import { extractEvent } from './apple-fm';

type Case = {
  input: string;
  today: string;
  expect: { date: string; start_time: string };
};

const TODAY = '2026-05-20'; // Wednesday

const CASES: Case[] = [
  { input: 'Book a dentist appointment tomorrow at 3pm', today: TODAY, expect: { date: '2026-05-21', start_time: '15:00' } },
  { input: 'Team standup tomorrow at 9am for 30 minutes', today: TODAY, expect: { date: '2026-05-21', start_time: '09:00' } },
  { input: 'Lunch with Sarah on Friday at noon', today: TODAY, expect: { date: '2026-05-22', start_time: '12:00' } },
  { input: 'Gym next Monday at 6pm', today: TODAY, expect: { date: '2026-05-25', start_time: '18:00' } },
  { input: "Let's do a fast 10 minute check-in tomorrow at 8:45am.", today: TODAY, expect: { date: '2026-05-21', start_time: '08:45' } },
];

let ran = false;

export async function runAppleSelfTest(): Promise<void> {
  if (ran) return;
  ran = true;
  console.log(`[apple-fm][selftest] running ${CASES.length} cases (anchor ${TODAY})…`);
  let passed = 0;
  for (const c of CASES) {
    try {
      const { event } = await extractEvent(c.input, c.today);
      const dateOk = event.date === c.expect.date;
      const timeOk = event.start_time === c.expect.start_time;
      const ok = dateOk && timeOk;
      if (ok) passed++;
      console.log(
        `[apple-fm][selftest] ${ok ? '✅' : '❌'} "${c.input}"\n` +
          `   title=${JSON.stringify(event.title)} date=${event.date} (exp ${c.expect.date})` +
          ` start=${event.start_time} (exp ${c.expect.start_time}) end=${event.end_time} repeats=${event.repeats}`,
      );
    } catch (e: any) {
      console.warn(`[apple-fm][selftest] 💥 "${c.input}": ${e?.message}`);
    }
  }
  console.log(
    `[apple-fm][selftest] ${passed}/${CASES.length} cases matched date+start_time exactly`,
  );
}
