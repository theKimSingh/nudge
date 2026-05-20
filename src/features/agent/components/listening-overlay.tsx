import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAgentSessionCtx } from '../context/agent-session-context';

import { AgentBackdrop } from './agent-backdrop';
import { EdgeGlow } from './edge-glow';
import { FeedbackBand } from './feedback-band';

// Match the longest exit animation in the children (backdrop + wave fade at
// 600ms). Keep the overlay mounted this long after `active` flips false so the
// fade-out actually gets to play instead of disappearing on unmount.
const EXIT_HOLD_MS = 650;

export function ListeningOverlay() {
  const { phase, transcript, amplitude, taskToasts, actionsCompleted } =
    useAgentSessionCtx();

  // Initial moment uses the longer phrasing; subsequent listens drop the
  // "I'm" prefix so the follow-up reads as a quick confirmation that the
  // mic is still hot rather than a turn-taking prompt.
  const listeningHint = actionsCompleted > 0 ? 'Listening…' : "I'm listening…";

  const active = phase !== 'idle';

  // Hold the overlay mounted briefly after going inactive so the children's
  // opacity-fade animations can complete before the View unmounts.
  const [holding, setHolding] = useState(active);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (active) {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      setHolding(true);
    } else {
      holdTimer.current = setTimeout(() => {
        setHolding(false);
        holdTimer.current = null;
      }, EXIT_HOLD_MS);
    }
    return () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [active]);

  if (!active && !holding) return null;

  // Status line shown beneath the transcript. Always present while active so
  // the user has a single source of truth for what the agent is currently
  // doing. (Old behavior — hide hint when transcript exists — left a stale
  // "I'm listening…" up while STT was actually running on the server.)
  const hint = !active
    ? null
    : phase === 'connecting'
      ? 'Connecting…'
      : phase === 'syncing'
        ? 'Processing…'
        : phase === 'thinking'
          ? 'Thinking…'
          : phase === 'listening'
            ? listeningHint
            : null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <AgentBackdrop active={active} />
      <EdgeGlow amplitude={amplitude} active={active} />

      {active ? (
        <FeedbackBand
          toasts={taskToasts}
          transcript={transcript}
          hint={hint}
        />
      ) : null}
    </View>
  );
}
