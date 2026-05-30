const { GoogleGenAI } = require('@google/genai');
const { TOOLS } = require('./tools');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Gemini occasionally returns transient 503 (UNAVAILABLE / "high demand") or 429
// (rate limit). Those are momentary and almost always clear on a quick retry —
// letting one bubble up kills the whole voice session, forcing the user to
// re-tap and re-speak. Retry transient failures with exponential backoff + jitter
// before giving up. Non-transient errors (bad request, auth) rethrow immediately.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_GEMINI_ATTEMPTS = 4;

function isTransientError(err) {
  const status = Number(err?.status ?? err?.code);
  if (TRANSIENT_STATUSES.has(status)) return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|please try again/i.test(
    String(err?.message || ''),
  );
}

function abortError() {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });
}

async function generateContentWithRetry(params, signal) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      if (attempt === MAX_GEMINI_ATTEMPTS || !isTransientError(err)) throw err;
      const backoff =
        Math.min(4000, 400 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(
        `[gemini] transient error (status=${err?.status ?? err?.code}); retry ${attempt}/${MAX_GEMINI_ATTEMPTS - 1} in ${backoff}ms`,
      );
      await delay(backoff, signal);
    }
  }
  throw lastErr;
}

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

  const result = await generateContentWithRetry({
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

async function runAgentTurn({ history, systemPrompt, signal }) {
  // Non-streaming: more reliable function-call extraction across SDK minor
  // versions. We previously used generateContentStream, but in @google/genai
  // 2.4 the streamed chunks' `functionCalls` accessor sometimes returned
  // empty even when the final response contained valid function calls,
  // producing "0 calls" rounds that broke the agent loop. Abort still works
  // via `config.abortSignal`.
  const result = await generateContentWithRetry(
    {
      model: 'gemini-2.5-flash',
      contents: history,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: TOOLS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        temperature: 0.2,
        abortSignal: signal,
      },
    },
    signal,
  );

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

module.exports = { plan, runAgentTurn };
