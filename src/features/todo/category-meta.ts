import type { TaskCategory } from '@/src/types/database';

// Visual mapping for each category. Lives in the client so emoji/color tweaks
// don't need a DB migration. Pastels are tuned for light mode but remain
// readable on the dark background (light-on-dark contrast is fine).
// Variation selector U+FE0F kept on 🍽️ and 🛏️ so iOS renders the colored glyph.
export const CATEGORY_META: Record<TaskCategory, { emoji: string; color: string }> = {
  meal:     { emoji: '🍽️', color: '#FFD8A8' },
  exercise: { emoji: '🏋️', color: '#B6E2C7' },
  work:     { emoji: '💼', color: '#C7D2FE' },
  study:    { emoji: '📚', color: '#FBCFE8' },
  sleep:    { emoji: '🛏️', color: '#C4B5FD' },
  selfcare: { emoji: '🚿', color: '#BAE6FD' },
  errand:   { emoji: '🛒', color: '#FDE68A' },
  social:   { emoji: '💬', color: '#FCA5A5' },
  health:   { emoji: '🩺', color: '#99F6E4' },
  other:    { emoji: '⭐', color: '#E5E7EB' },
};
