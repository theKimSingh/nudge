import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Fonts } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  text: string;
  /** Unconfirmed trailing words. Rendered faint after `text`, re-rendered fresh
   *  each update (not accumulated) so corrections replace cleanly. */
  tail?: string;
};

type Token = {
  id: string;
  word: string;
};

// Cap retained words to ~4 wrapped lines (≈ TOKENS_PER_LINE × 4). A longer
// dictation keeps the most recent ~4 lines; older words trim off the top. The
// transcript does NOT fade out over time — once the user stops it HANGS until
// `text` is reset (e.g. cleared when the success chips replace it).
const MAX_TOKENS = 20;

// Position-based fade. `rank` counts back from the newest token (0 = newest).
// The newest FULL_RECENT_TOKENS words (~2 lines) stay at FULL_ALPHA; every older
// line drops PER_LINE_FADE, floored at FAINT_FLOOR so it remains readable.
const FULL_ALPHA = 0.95;
const FAINT_FLOOR = 0.28;
const FULL_RECENT_TOKENS = 9; // ≈ 2 wrapped lines
const TOKENS_PER_LINE = 5;
const PER_LINE_FADE = 0.22;
// Opacity for the unconfirmed tail — clearly tentative but readable.
const TAIL_ALPHA = 0.4;

// Split a transcript into display words, preserving punctuation so the rendered
// transcript matches what ASR actually produced ("early." stays "early.",
// "2:30" stays "2:30"). Punctuation rides on the trailing token of each word.
function toWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export function TranscriptStream({ text, tail = '' }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const [tokens, setTokens] = useState<Token[]>([]);
  const prevTextRef = useRef('');
  const seqRef = useRef(0);

  useEffect(() => {
    const prev = prevTextRef.current;
    prevTextRef.current = text;

    // Reset (cleared when the action lands / success chip replaces it) → drop
    // the tokens. This is the ONLY way the transcript clears now; it no longer
    // fades out on its own after the user stops talking.
    if (!text.trim()) {
      setTokens((curr) => (curr.length ? [] : curr));
      return;
    }

    // Append-only when the new text extends the old. Case-insensitive so
    // capitalization drift between decodes doesn't force a full rebuild/flash.
    if (prev && text.toLowerCase().startsWith(prev.toLowerCase())) {
      const added = toWords(text.slice(prev.length));
      if (!added.length) return;
      const now = Date.now();
      setTokens((curr) => {
        const next = [
          ...curr,
          ...added.map((word) => ({ id: `${now}-${seqRef.current++}`, word })),
        ];
        return next.length > MAX_TOKENS ? next.slice(next.length - MAX_TOKENS) : next;
      });
      return;
    }

    // Otherwise it's a fresh utterance / divergent re-decode — rebuild from the
    // current text.
    const now = Date.now();
    let next = toWords(text).map((word) => ({
      id: `${now}-${seqRef.current++}`,
      word,
    }));
    if (next.length > MAX_TOKENS) next = next.slice(next.length - MAX_TOKENS);
    setTokens(next);
  }, [text]);

  const dark = scheme === 'dark';
  const baseRGB = dark ? '255,255,255' : '10,10,10';
  const haloColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';

  return (
    <View style={styles.container} pointerEvents="none">
      {tokens.map((token, i) => {
        // Position fade only: older lines sit fainter, newest ~2 lines full.
        // No time-based fade — the transcript stays put until it's cleared.
        const rank = tokens.length - 1 - i; // 0 = newest
        const linesAbove =
          rank < FULL_RECENT_TOKENS
            ? 0
            : Math.floor((rank - FULL_RECENT_TOKENS) / TOKENS_PER_LINE) + 1;
        const alpha = Math.max(FAINT_FLOOR, FULL_ALPHA - linesAbove * PER_LINE_FADE);
        return (
          <Animated.Text
            key={token.id}
            entering={FadeIn.duration(150)}
            style={[
              styles.token,
              { color: `rgba(${baseRGB},${alpha})`, textShadowColor: haloColor },
            ]}
          >
            {token.word}
          </Animated.Text>
        );
      })}
      {/* Unconfirmed tail — rendered straight from the prop (not accumulated),
          so a correction just replaces these words instead of leaving stale
          tokens behind. Faint to signal "still being decoded". */}
      {tail
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => (
          <Animated.Text
            key={`tail-${i}`}
            style={[
              styles.token,
              { color: `rgba(${baseRGB},${TAIL_ALPHA})`, textShadowColor: haloColor },
            ]}
          >
            {word}
          </Animated.Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Constrain to the parent's width so flexWrap actually wraps. Without
    // an explicit width, a row flex container sizes to its content — and
    // `flexWrap` only kicks in when horizontal space runs out, which
    // never happens with intrinsic sizing. The tokens just kept marching
    // off the right edge of the screen.
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    // Center each wrapped row horizontally so the transcript stays
    // visually anchored under the chip stack instead of left-creeping.
    justifyContent: 'center',
    gap: 6,
  },
  token: {
    fontFamily: Fonts.displayBold,
    fontWeight: '700',
    fontSize: 16,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
