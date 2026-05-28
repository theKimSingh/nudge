import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Fonts } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

type Props = {
  text: string;
  tokenLifetimeMs?: number;
};

type Token = {
  id: string;
  word: string;
  bornAt: number;
};

// Keep enough words for ~5-6 wrapped lines. The newest ~2 lines render at full
// opacity; older lines ramp fainter (but stay visible), and feedback-band's
// bottom-anchored slot clips anything past the ceiling — by which point the
// fade has already dimmed it to near-zero. Lifetime is generous so a growing
// utterance doesn't lose its start mid-sentence; it dissolves a while after the
// user stops speaking.
const MAX_TOKENS = 30;
const DEFAULT_LIFETIME_MS = 8000;

// Position-based fade. `rank` counts back from the newest token (0 = newest).
// The newest FULL_RECENT_TOKENS words (~2 lines) stay at FULL_ALPHA; every older
// line drops PER_LINE_FADE, floored at FAINT_FLOOR so it remains readable.
const FULL_ALPHA = 0.95;
const FAINT_FLOOR = 0.28;
const FULL_RECENT_TOKENS = 9; // ≈ 2 wrapped lines
const TOKENS_PER_LINE = 5;
const PER_LINE_FADE = 0.22;

export function TranscriptStream({ text, tokenLifetimeMs = DEFAULT_LIFETIME_MS }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const [tokens, setTokens] = useState<Token[]>([]);
  const [, setNow] = useState(0);
  const prevTextRef = useRef('');
  const seqRef = useRef(0);

  useEffect(() => {
    const prev = prevTextRef.current;
    let added: string[];
    if (text.startsWith(prev)) {
      const tail = text.slice(prev.length);
      added = tail.split(/\s+/).filter(Boolean);
    } else {
      const prevWords = prev.split(/\s+/).filter(Boolean);
      const currWords = text.split(/\s+/).filter(Boolean);
      added = currWords.slice(prevWords.length);
      if (added.length === 0 && currWords.length > prevWords.length) {
        added = currWords.slice(-1);
      }
    }
    prevTextRef.current = text;
    if (added.length === 0) return;

    const now = Date.now();
    setTokens((curr) => {
      const next = [
        ...curr,
        ...added.map((word) => ({
          id: `${now}-${seqRef.current++}`,
          word,
          bornAt: now,
        })),
      ];
      if (next.length > MAX_TOKENS) {
        return next.slice(next.length - MAX_TOKENS);
      }
      return next;
    });
  }, [text]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTokens((curr) => {
        const filtered = curr.filter((t) => now - t.bornAt < tokenLifetimeMs);
        if (filtered.length === curr.length) {
          setNow(now);
          return curr;
        }
        return filtered;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [tokenLifetimeMs]);

  const now = Date.now();
  const dark = scheme === 'dark';
  // Tokens ramp from 0.95 → 0 over their lifetime instead of relying on a
  // Reanimated `exiting` animation. `exiting` orphan-renders the token at
  // its absolute screen position when removed, which crashes into wherever
  // the hint snapped after the parent transcriptSlot collapsed. Doing the
  // fade as an in-place opacity ramp means the token is already invisible
  // by the time it unmounts — no orphan animation possible.
  const baseRGB = dark ? '255,255,255' : '10,10,10';
  const fadeOutWindowMs = 600;

  return (
    <View style={styles.container} pointerEvents="none">
      {tokens.map((token, i) => {
        const ageMs = now - token.bornAt;
        const remaining = tokenLifetimeMs - ageMs;
        // Position fade: how many lines this token sits above the bright zone.
        const rank = tokens.length - 1 - i; // 0 = newest
        const linesAbove =
          rank < FULL_RECENT_TOKENS
            ? 0
            : Math.floor((rank - FULL_RECENT_TOKENS) / TOKENS_PER_LINE) + 1;
        const positionAlpha = Math.max(
          FAINT_FLOOR,
          FULL_ALPHA - linesAbove * PER_LINE_FADE,
        );
        // Final dissolve over the last fadeOutWindowMs of a token's life.
        const exitAlpha =
          remaining < fadeOutWindowMs
            ? Math.max(0, remaining / fadeOutWindowMs)
            : 1;
        const alpha = positionAlpha * exitAlpha;
        return (
          <Animated.Text
            key={token.id}
            entering={FadeIn.duration(150)}
            style={[
              styles.token,
              {
                color: `rgba(${baseRGB},${alpha})`,
                // Opposite-color halo so the word floats off whatever the blur
                // is showing through right now.
                textShadowColor: dark
                  ? 'rgba(0,0,0,0.55)'
                  : 'rgba(255,255,255,0.85)',
              },
            ]}
          >
            {token.word}
          </Animated.Text>
        );
      })}
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
