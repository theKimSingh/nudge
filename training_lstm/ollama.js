import 'dotenv/config';
import fs from 'fs';

// ======================
// LOAD TEST DATASET
// ======================

const testSuite = JSON.parse(
  fs.readFileSync('./test.json', 'utf-8')
);

// ======================
// SAFE JSON EXTRACTION
// ======================

function extractFirstJSONValue(text) {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const starts = [firstBrace, firstBracket].filter((i) => i !== -1);

  if (!starts.length) {
    throw new Error('No JSON value found');
  }

  const firstJson = Math.min(...starts);
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = firstJson; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
    }

    if (!inString) {
      if (char === '{') stack.push('}');
      if (char === '[') stack.push(']');

      if (char === '}' || char === ']') {
        const expected = stack.pop();
        if (char !== expected) {
          throw new Error('Mismatched JSON delimiters');
        }
      }

      if (stack.length === 0) {
        return text.slice(firstJson, i + 1);
      }
    }
  }

  throw new Error('Incomplete JSON value');
}

function normalizeEvent(rawEvent) {
  return {
    id: rawEvent.id ?? null,
    summary: rawEvent.summary ?? null,
    date: rawEvent.date ?? null,
    time: rawEvent.time ?? null,
    duration:
      rawEvent.duration !== undefined
        ? Math.round(rawEvent.duration)
        : null,
    repeats: rawEvent.repeats ?? null,
    repeat_custom: rawEvent.repeat_custom ?? null
  };
}

function normalizeOutput(output) {
  return Array.isArray(output)
    ? output.map(normalizeEvent)
    : normalizeEvent(output);
}

// ======================
// MODEL CALL
// ======================

async function extractEventData(text, testDate) {

  const today =
    testDate || new Date().toISOString().split('T')[0];

  const systemPrompt = `
Extract calendar event information.

TODAY = ${today}

Return ONLY valid JSON.

Schema:
Single event:
{
  "id": null,
  "summary": string,
  "date": "YYYY-MM-DD",
  "time": "HH:MM:SS",
  "duration": integer (in minutes),
  "repeats": null | "daily" | "weekly" | "monthly" | "yearly" | "custom",
  "repeat_custom": null | string
}

Multiple events:
[
  { event object },
  { event object }
]

Rules:
- tomorrow = TODAY + 1 day
- weekday = next occurrence after TODAY
- default duration = 60
- default missing time = 09:00:00
- calculate duration from time difference when both start and end times are known
- use sensible activity-based defaults when only start time is known (doctor=60, meeting=30, etc)
- return an array when the input creates multiple events
- repeats daily for phrases like "every day"
- repeats weekly for phrases like "every Monday" or "every week"
- repeats monthly for phrases like "every month" or "monthly"
- repeats yearly for phrases like "every year", "annually", or "yearly"
- repeats custom for unsupported patterns like "weekdays", "Monday through Friday", "every 2 weeks", "every third Friday", or "every 3 months"
- repeat_custom is null unless repeats is custom; when custom, store the original repeat pattern as concise text
- remove dates/times from summary
`;


  const qwenBaseUrl =
    process.env.QWEN_LOCAL_BASE_URL ||
    'http://127.0.0.1:8000';

  const qwenModel =
    process.env.QWEN_MODEL_NAME ||
    'qwen3_0_6b_event_extractor';

  const response = await fetch(
    `${qwenBaseUrl}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: qwenModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: text
          }
        ],
        stream: false
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Qwen local runtime error: ${response.status}`
    );
  }

  const data = await response.json();

  let content =
    data.choices?.[0]?.message?.content ||
    data.message?.content ||
    '';

  content = content
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  console.log('\n=== RAW MODEL RESPONSE ===');
  console.log(content);
  console.log('==========================\n');

  let parsedData;

  try {

    // extract ONLY the first JSON object or array
    const jsonOnly = extractFirstJSONValue(content);

    console.log('\n=== EXTRACTED JSON ===');
    console.log(jsonOnly);
    console.log('======================\n');

    parsedData = JSON.parse(jsonOnly);

  } catch (err) {

    console.log('\n=== INVALID JSON ===');
    console.log(content);
    console.log('====================\n');

    throw err;
  }

  return normalizeOutput(parsedData);
}

// ======================
// TEST RUNNER
// ======================

async function runTestSuite() {

  console.log(
    `🚀 Loaded ${testSuite.length} cases\n`
  );

  let passedCount = 0;

  const mockToday = '2026-05-20';

  for (let i = 0; i < testSuite.length; i++) {

    const test = testSuite[i];

    console.log(
      `\n==============================`
    );

    console.log(`Test #${i + 1}`);

    console.log(
      `Input: "${test.input}"`
    );

    try {

      const actual =
        await extractEventData(
          test.input,
          mockToday
        );

      const expected = normalizeOutput(test.output);

      const passed =
        JSON.stringify(actual) === JSON.stringify(expected);

      if (passed) {

        console.log('✅ PASSED');

        passedCount++;

      } else {

        console.log('❌ FAILED');

        console.log('\nExpected:');
        console.log(
          JSON.stringify(expected, null, 2)
        );

        console.log('\nActual:');
        console.log(
          JSON.stringify(actual, null, 2)
        );

        console.log('\nOutput matches expected:');
        console.log(passed);
      }

    } catch (err) {

      console.log('❌ ERROR');
      console.log(err);
    }
  }

  console.log('\n==============================');
  console.log('FINAL RESULTS');
  console.log('==============================');

  console.log(
    `Passed: ${passedCount}/${testSuite.length}`
  );

  console.log(
    `Accuracy: ${(
      (passedCount / testSuite.length) *
      100
    ).toFixed(2)}%`
  );
}

runTestSuite();
