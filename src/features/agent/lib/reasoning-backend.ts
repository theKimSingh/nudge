// Which model turns the ASR transcript into a calendar action.
//
//  'apple' — Apple Foundation Model via the `afm` OpenAI server (see apple-fm.ts).
//            Emits an event JSON directly; no tool-calling loop. (Kim, ~70%.)
//  'qwen'  — the on-device fine-tuned Qwen3 + tool-calling agent loop (llamarn).
//
// Qwen is intentionally set aside for now — flip this back to 'qwen' to restore
// the agent-loop path. ASR (Moonshine) is shared by both and unaffected.
export type ReasoningBackend = 'apple' | 'qwen';

export const REASONING_BACKEND: ReasoningBackend = 'apple';
