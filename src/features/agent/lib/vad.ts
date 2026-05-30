export type VadEvent = { type: 'speech_start' | 'speech_end'; ts: number };

export type VadConfig = {
  rmsWindowMs?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  noiseFloorRise?: number;
  hysteresisDb?: number;
};

type State = 'silent' | 'candidate_speech' | 'speaking' | 'candidate_silent';

const INITIAL_FLOOR_DB = -60;

export function createVad(cfg?: VadConfig) {
  // Device-independent voice gating. We never use an absolute dB threshold —
  // mic sensitivity + OS AGC make the same sound read differently on every
  // phone. Instead we track the room's noise floor live (per device, per
  // environment) and require speech to clear it by `hysteresisDb`.
  //
  // The margin works because the user speaks INTO the phone (near-field), so
  // their voice lands ~20-35 dB above ambient, while background noise sits near
  // the floor. A 16 dB margin drops the trigger into that gap: above typical
  // background, below near-field speech — and since it's relative to the
  // measured floor, it self-calibrates on any device/room. (The old 10 dB was
  // too low, so a TV / nearby talker cleared it and registered as speech.)
  //
  // silenceMs 1800: wait out natural mid-plan pauses/stutters instead of
  // shipping a fragment. minSpeechMs 400: reject transient clicks/taps.
  const silenceMs = cfg?.silenceMs ?? 1800;
  const minSpeechMs = cfg?.minSpeechMs ?? 400;
  const floorRise = cfg?.noiseFloorRise ?? 0.05;
  const hysteresisDb = cfg?.hysteresisDb ?? 16;

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
