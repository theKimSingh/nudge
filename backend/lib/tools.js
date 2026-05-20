// Gemini function-call tool declarations for the agent loop.
// Schema is the JSONSchema-subset accepted by @google/genai's
// `functionDeclarations`. Keep parameter shapes aligned with executor.js —
// it dispatches off `name` and reads `args` directly.

const TOOLS = [
  {
    name: 'create_task',
    description:
      'Create a new task. Use repeat_rule for recurring events. For multi-weekday recurrences ' +
      '("Tue and Thu") emit ONE create_task per weekday with repeat_rule="weekly".',
    parameters: {
      type: 'object',
      required: ['title', 'date'],
      properties: {
        title: { type: 'string', description: 'Short clean label (1-3 words). Reuse a ROUTINE DEFAULTS key when applicable.' },
        date: {
          type: 'string',
          description:
            'YYYY-MM-DD. For weekly recurrence, the next occurrence of the chosen weekday on/after today.',
        },
        time_minutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1439,
          description: 'Local minutes from midnight. Default 540 (9:00) if omitted.',
        },
        duration_minutes: {
          type: 'integer',
          minimum: 5,
          description: 'Default 30 if omitted (or routine default if available).',
        },
        repeat_rule: {
          type: 'string',
          enum: ['none', 'daily', 'weekdays', 'weekly'],
          description: 'Default "none".',
        },
        category: {
          type: 'string',
          enum: ['meal', 'exercise', 'work', 'study', 'sleep', 'selfcare', 'errand', 'social', 'health', 'other'],
          description:
            'Optional. Pass when you are confident of the bucket (e.g. "Doctor appt" → health, "Pick up groceries" → errand). Omit if uncertain — server infers from title.',
        },
      },
    },
  },
  {
    name: 'update_task',
    description:
      'Modify an existing task. Pass the EXACT task_id from the prompt context. ' +
      'Provide only the fields that change inside `fields`. Use `scope` for series semantics.',
    parameters: {
      type: 'object',
      required: ['task_id', 'fields'],
      properties: {
        task_id: { type: 'string', description: 'UUID of an existing task in the prompt context.' },
        scope: {
          type: 'string',
          enum: ['instance', 'this_and_future', 'series'],
          description: 'Default "instance".',
        },
        fields: {
          type: 'object',
          description: 'Subset of mutable task fields to change. Only provided keys are touched.',
          properties: {
            title: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD. Only meaningful for scope="instance".' },
            time_minutes: { type: 'integer', minimum: 0, maximum: 1439 },
            duration_minutes: { type: 'integer', minimum: 5 },
            repeat_rule: {
              type: 'string',
              enum: ['none', 'daily', 'weekdays', 'weekly'],
              description: 'Changing this rebuilds the in-scope rows.',
            },
            done: { type: 'boolean' },
            category: {
              type: 'string',
              enum: ['meal', 'exercise', 'work', 'study', 'sleep', 'selfcare', 'errand', 'social', 'health', 'other'],
              description: 'Optional. Override the inferred category. Omit unless the user explicitly recategorizes.',
            },
          },
        },
      },
    },
  },
  {
    name: 'delete_task',
    description: 'Delete an existing task. Use scope="series" to wipe the whole series.',
    parameters: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        scope: {
          type: 'string',
          enum: ['instance', 'this_and_future', 'series'],
          description: 'Default "instance".',
        },
      },
    },
  },
  {
    name: 'update_meal_default',
    description:
      "Change the user's recurring meal default. Only call when the user states a stable, " +
      'recurring change ("I eat lunch at 1 now"). Do NOT call for one-off shifts ("today I will eat at 1").',
    parameters: {
      type: 'object',
      required: ['meal', 'time_minutes'],
      properties: {
        meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
        time_minutes: { type: 'integer', minimum: 0, maximum: 1439 },
      },
    },
  },
  {
    name: 'upsert_constraint',
    description:
      'Persist a high-confidence stable preference (e.g. "no meetings before 10am"). ' +
      'Only for explicit ongoing rules — not one-off requests.',
    parameters: {
      type: 'object',
      required: ['text', 'category', 'strength'],
      properties: {
        text: {
          type: 'string',
          description: 'Short, lowercase, third-person normalization of the rule.',
        },
        category: { type: 'string', enum: ['time', 'avoid', 'prefer', 'energy', 'other'] },
        strength: { type: 'string', enum: ['hard', 'soft'] },
      },
    },
  },
  {
    name: 'undo_last',
    description:
      'Revert the most recent N agent operations (default 1). Use whenever the user says ' +
      '"undo", "scratch that", "no wait", "nevermind that last one", or otherwise asks to ' +
      'revert the most recent change(s). NEVER use delete_task to undo your own create — go ' +
      'through this so the journal stays consistent.',
    parameters: {
      type: 'object',
      properties: {
        n: { type: 'integer', minimum: 1, maximum: 20, description: 'Default 1.' },
      },
    },
  },
  {
    name: 'done',
    description:
      "Terminal call: signals the user's intent has been fully reflected. ALWAYS call this last. " +
      'Pass a one-sentence summary suitable for a toast.',
    parameters: {
      type: 'object',
      required: ['summary'],
      properties: {
        summary: { type: 'string', maxLength: 160 },
      },
    },
  },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

module.exports = { TOOLS, TOOL_NAMES };
