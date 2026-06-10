// Web stub — react-native-sherpa-onnx is a native-only module and cannot run
// in a browser. Metro resolves this file instead of moonshine-asr.ts on web.
// The session hook checks asrReady before allowing the mic to activate, so
// the user sees "not available" rather than a crash.

import { useRef } from 'react';
import type { AsrStream } from './asr-engine';

async function* emptyStream(): AsyncGenerator<
  { committed: { text: string }; nonCommitted: { text: string } },
  void,
  unknown
> {}

export function useMoonshineStream(): AsrStream {
  const genRef = useRef(emptyStream);
  return {
    isReady: false,
    isGenerating: false,
    downloadProgress: 0,
    error: { message: 'On-device ASR is not available in the browser — use the mobile app.' },
    stream: genRef.current,
    streamInsert: () => {},
    streamStop: () => {},
    beginUtterance: () => {},
    finalize: async () => '',
  };
}
