import 'dotenv/config';
import fs from 'fs';

// ======================
// LOAD TEST DATASET
// ======================

const testSuite = JSON.parse(
  fs.readFileSync('./synthetic_event_extraction_dataset.json', 'utf-8')
);

// ======================
// SAFE JSON EXTRACTION
// ======================

function extractFirstJSONObject(text) {
  const firstBrace = text.indexOf('{');

  if (firstBrace === -1) {
    throw new Error('No JSON object found');
  }

  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < text.length; i++) {
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
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      if (braceCount === 0) {
        return text.slice(firstBrace, i + 1);
      }
    }
  }

  throw new Error('Incomplete JSON object');
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
{
  "id": null,
  "summary": string,
  "begin": "YYYY-MM-DDTHH:MM:SS",
  "duration": integer,
  "repeats": null | "daily" | "weekly" | "weekdays"
}

Rules:
- tomorrow = TODAY + 1 day
- weekday = next occurrence after TODAY
- default duration = 60
- default missing time = 09:00:00
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

    // extract ONLY first JSON object
    const jsonOnly = extractFirstJSONObject(content);

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

  const rawEvent = Array.isArray(parsedData)
    ? parsedData[0]
    : parsedData;

  return {
    id: rawEvent.id ?? null,
    summary: rawEvent.summary ?? null,
    begin: rawEvent.begin
      ? rawEvent.begin.split('.')[0]
      : null,
    duration:
      rawEvent.duration !== undefined
        ? Math.round(rawEvent.duration)
        : null,
    repeats: rawEvent.repeats ?? null
  };
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

      const expected = Array.isArray(test.output)
        ? test.output[0]
        : test.output;

      const summaryPass =
        actual.summary === expected.summary;

      const beginPass =
        actual.begin === expected.begin;

      const durationPass =
        actual.duration === expected.duration;

      const repeatsPass =
        actual.repeats === expected.repeats;

      const idPass =
        actual.id === expected.id;

      const passed =
        summaryPass &&
        beginPass &&
        durationPass &&
        repeatsPass &&
        idPass;

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

        console.log('\nChecks:');

        console.log({
          summaryPass,
          beginPass,
          durationPass,
          repeatsPass,
          idPass
        });
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