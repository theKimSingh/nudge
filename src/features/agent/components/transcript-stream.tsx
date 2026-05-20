import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

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

// Cap the live transcript at ~2-3 wrapped lines so a long dictation
// ("So today I want to do X, Y, then Z, and …") doesn't push the
// feedback-band off the top of the screen. Older words still self-trim
// via the lifetime expiry, but this is the hard upper bound.
const MAX_TOKENS = 14;
const DEFAULT_LIFETIME_MS = 4500;

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
      {tokens.map((token) => {
        const ageMs = now - token.bornAt;
        const remaining = tokenLifetimeMs - ageMs;
        const lifeAlpha = Math.max(
          0.55,
          Math.min(0.95, 1 - ageMs / tokenLifetimeMs),
        );
        const exitAlpha =
          remaining < fadeOutWindowMs
            ? Math.max(0, remaining / fadeOutWindowMs)
            : 1;
        const alpha = lifeAlpha * exitAlpha;
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
