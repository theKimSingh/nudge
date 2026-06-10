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
  const {
    phase,
    transcript,
    transcriptTail,
    amplitude,
    taskToasts,
    actionsCompleted,
    downloadProgress,
  } = useAgentSessionCtx();

  // Initial moment uses the longer phrasing; subsequent listens drop the
  // "I'm" prefix so the follow-up reads as a quick confirmation that the
  // mic is still hot rather than a turn-taking prompt.
  const listeningHint = actionsCompleted > 0 ? 'Listening…' : "I'm listening…";

  // 'loading' is the cold-start model warm-up phase; the overlay stays hidden
  // for it (the FloatingMic surfaces the loading state via its own affordance).
  const active = phase !== 'idle' && phase !== 'loading';

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

  // With local streaming ASR the growing transcript itself is the listening
  // indicator. Showing "I'm listening…" beside the user's own words being
  // typed is double-signaling, so we suppress the hint during `listening` once
  // any transcript text exists. Hint returns between utterances (transcript
  // gets cleared on tool_result for mutations).
  const hint = !active
    ? null
    : phase === 'connecting'
      ? 'Connecting…'
      : phase === 'syncing'
        ? 'Processing…'
        : phase === 'thinking'
          ? 'Thinking…'
          : phase === 'listening'
            ? transcript.length > 0
              ? null
              : listeningHint
            : null;
  // Suppress the unused-var warning while keeping downloadProgress in the
  // destructure for future loading affordances.
  void downloadProgress;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <AgentBackdrop active={active} />
      <EdgeGlow amplitude={amplitude} active={active} />

      {active ? (
        <FeedbackBand
          toasts={taskToasts}
          transcript={transcript}
          transcriptTail={transcriptTail}
          hint={hint}
        />
      ) : null}
    </View>
  );
}
