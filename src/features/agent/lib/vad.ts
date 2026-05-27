export type VadEvent = { type: 'speech_start' | 'speech_end'; ts: number };

export type VadConfig = {
  rmsWindowMs?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  noiseFloorRise?: number;
  hysteresisDb?: number;
};

type State = 'silent' | 'candidate_speech' | 'speaking' | 'candidate_silent';

const INITIAL_FLOOR_DB = -55;

export function createVad(cfg?: VadConfig) {
  // Tuned against real-device + Whisper streaming. Whisper Tiny needs ~2s of
  // audio context to produce a stable transcript; cutting it off after only
  // 400ms of silence handed it sub-1s clips that came back empty. 900ms
  // silence + 400ms minSpeech rides out natural breath/word pauses without
  // letting the user feel laggy. Hysteresis widened to 10dB to suppress the
  // ambient blips that previously oscillated speech_start.
  const silenceMs = cfg?.silenceMs ?? 1200;
  const minSpeechMs = cfg?.minSpeechMs ?? 400;
  const floorRise = cfg?.noiseFloorRise ?? 0.05;
  const hysteresisDb = cfg?.hysteresisDb ?? 10;

  let noiseFloor = INITIAL_FLOOR_DB;
  let state: State = 'silent';
  let candidateStartTs = 0;

  function reset() {
    noiseFloor = INITIAL_FLOOR_DB;
    state = 'silent';
    candidateStartTs = 0;
  }

  function push(meteringDb: number, ts: number): VadEvent | null {
    if (!Number.isFinite(meteringDb)) return null;

    const speakThreshold = noiseFloor + hysteresisDb;
    const silenceThreshold = noiseFloor + hysteresisDb / 2;
    const above = meteringDb > speakThreshold;
    const below = meteringDb < silenceThreshold;

    let event: VadEvent | null = null;

    switch (state) {
      case 'silent': {
        if (above) {
          state = 'candidate_speech';
          candidateStartTs = ts;
        } else {
          noiseFloor = noiseFloor + floorRise * (meteringDb - noiseFloor);
        }
        break;
      }
      case 'candidate_speech': {
        if (above) {
          if (ts - candidateStartTs >= minSpeechMs) {
            state = 'speaking';
            event = { type: 'speech_start', ts: candidateStartTs };
          }
        } else {
          state = 'silent';
          candidateStartTs = 0;
          noiseFloor = noiseFloor + floorRise * (meteringDb - noiseFloor);
        }
        break;
      }
      case 'speaking': {
        if (below) {
          state = 'candidate_silent';
          candidateStartTs = ts;
        }
        break;
      }
      case 'candidate_silent': {
        if (above) {
          state = 'speaking';
          candidateStartTs = 0;
        } else if (below) {
          if (ts - candidateStartTs >= silenceMs) {
            state = 'silent';
            event = { type: 'speech_end', ts };
            candidateStartTs = 0;
            noiseFloor = noiseFloor + floorRise * (meteringDb - noiseFloor);
          }
        }
        break;
      }
    }

    return event;
  }

  return { push, reset };
}
