const { GoogleGenAI } = require('@google/genai');
const { TOOLS } = require('./tools');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['summary', 'operations', 'new_constraints', 'reinforced_constraint_ids'],
  properties: {
    summary: { type: 'string', maxLength: 120 },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['op_type'],
        properties: {
          op_type: { type: 'string', enum: ['create', 'update', 'delete'] },
          task_id: { type: 'string' },
          title: { type: 'string', maxLength: 60 },
          date: { type: 'string' },
          time_minutes: { type: 'integer', minimum: 0, maximum: 1439 },
          duration_minutes: { type: 'integer', minimum: 5 },
          repeat_rule: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly'] },
          scope: { type: 'string', enum: ['instance', 'this_and_future', 'series'] },
          done: { type: 'boolean' },
        },
      },
    },
    new_constraints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'category', 'strength', 'confidence'],
        properties: {
          text: { type: 'string', maxLength: 120 },
          category: { type: 'string', enum: ['time', 'avoid', 'prefer', 'energy', 'other'] },
          strength: { type: 'string', enum: ['hard', 'soft'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    reinforced_constraint_ids: { type: 'array', items: { type: 'string' } },
  },
};

function stripFences(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

async function plan({ audioBase64, mimeType, userText, systemPrompt }) {
  const parts = [];
  if (audioBase64) {
    parts.push({ inlineData: { mimeType: mimeType || 'audio/aac', data: audioBase64 } });
  }
  if (userText) {
    parts.push({ text: userText });
  }

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 1024 },
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const finishReason = result.candidates?.[0]?.finishReason;
  const text = result.text;
  if (finishReason && finishReason !== 'STOP') {
    const err = new Error(`Gemini stopped early: ${finishReason}`);
    err.finishReason = finishReason;
    err.partial = String(text || '').slice(0, 500);
    throw err;
  }
  return JSON.parse(stripFences(text));
}

// Heuristic guard against prompt-echo hallucinations. When the audio has no
// clear speech, Gemini sometimes emits the instruction text back. Drop any
// output that looks like our prompt or talks about its own role.
const PROMPT_ECHO_RE =
  /\b(transcrib|verbatim|plain text|no labels|no quotes|return only|empty string|no speech|audio input|the audio|spoken words?)\b/i;

// Literal compliance phrases the model sometimes returns instead of empty
// output when the audio is silent ("nothing at all" came from our own prompt
// wording). Match the entire trimmed string so we don't drop legitimate
// transcripts that happen to contain these words.
const SILENCE_LITERAL_RE =
  /^[\s.,!?'"-]*(nothing( at all)?|no(thing| speech| audio| sound)?|silen(ce|t)|inaudible|\(.*\))[\s.,!?'"-]*$/i;

async function transcribe({ audioBase64, mimeType }) {
  const t0 = Date.now();
  const bytes = Math.floor((audioBase64.length * 3) / 4);
  console.log(`[gemini] transcribe → ${bytes}B ${mimeType || 'audio/aac'}`);
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/aac', data: audioBase64 } },
          {
            // Short, lexically distant from anything a user would say so the
            // model doesn't extend a half-heard "Can you..." into the prompt
            // text. Empty output is explicitly preferred over guesswork.
            text: 'Write the words spoken in this clip. If no clear speech, write nothing at all.',
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      // 60s @ 150 wpm ≈ 200 output tokens. Backend caps utterances at 8s, so
      // 256 leaves slack for legit transcriptions but won't bankroll a long
      // hallucinated echo.
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const finishReason = result.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    const err = new Error(`Gemini stopped early: ${finishReason}`);
    err.finishReason = finishReason;
    console.error(`[gemini] transcribe ✗ finishReason=${finishReason} in ${Date.now() - t0}ms`);
    throw err;
  }
  let text = String(result.text || '').trim();
  // Strip surrounding quotes the model sometimes adds despite being told not to.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  // If the output reads like our own instruction echoed back, treat as silence.
  if (text && PROMPT_ECHO_RE.test(text)) {
    console.warn(`[gemini] transcribe ✗ prompt-echo detected, treating as empty: "${text.slice(0, 120)}"`);
    text = '';
  }
  // Catch literal compliance responses ("nothing at all.", "silence", etc.) —
  // the model takes our "write nothing at all" instruction literally and
  // sometimes returns that string. Treat as silence.
  if (text && SILENCE_LITERAL_RE.test(text)) {
    console.warn(`[gemini] transcribe ✗ silence-literal detected, treating as empty: "${text}"`);
    text = '';
  }
  // Strip timestamp annotations like "[ 0m0s900ms - 0m1s100ms ]" that the
  // model occasionally injects in front of (or between) words. Conservative
  // pattern: only matches bracketed runs that contain `<digits>ms`, so it
  // won't eat normal user speech that happens to use brackets.
  if (text) {
    const cleaned = text
      .replace(/\[[^\]]*\d+\s*ms[^\]]*\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned !== text) {
      console.warn(`[gemini] transcribe stripped timestamp annotation: "${text.slice(0, 120)}" → "${cleaned.slice(0, 120)}"`);
      text = cleaned;
    }
  }
  console.log(`[gemini] transcribe ✓ in ${Date.now() - t0}ms → "${text.slice(0, 200)}"${text.length > 200 ? '…' : ''}`);
  return text;
}

async function runAgentTurn({ history, systemPrompt, signal }) {
  // Non-streaming: more reliable function-call extraction across SDK minor
  // versions. We previously used generateContentStream, but in @google/genai
  // 2.4 the streamed chunks' `functionCalls` accessor sometimes returned
  // empty even when the final response contained valid function calls,
  // producing "0 calls" rounds that broke the agent loop. Abort still works
  // via `config.abortSignal`.
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: history,
    config: {
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      temperature: 0.2,
      abortSignal: signal,
    },
  });

  // SDK exposes `functionCalls` as a getter on the response (filters parts
  // that carry a functionCall). Falls back to walking candidate parts so we
  // still work if the getter shape shifts in a future minor.
  let calls = Array.isArray(result.functionCalls) ? result.functionCalls : [];
  if (!calls.length) {
    const parts = result.candidates?.[0]?.content?.parts ?? [];
    calls = parts
      .map((p) => p.functionCall)
      .filter((fc) => fc && typeof fc === 'object' && fc.name);
  }
  const text = typeof result.text === 'string' ? result.text : '';

  const modelContent = {
    role: 'model',
    parts: calls.length
      ? calls.map((c) => ({ functionCall: c }))
      : [{ text }],
  };
  if (!calls.length) {
    console.log(`[runAgentTurn] 0 calls; model text: "${text.slice(0, 400)}"`);
  }
  return { functionCalls: calls, modelContent };
}

module.exports = { plan, transcribe, runAgentTurn };
