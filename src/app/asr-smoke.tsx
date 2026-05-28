import { Buffer } from 'buffer';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';

import { ASR_ENGINE, useActiveAsrStream } from '@/src/features/agent/lib/asr-engine';

const AUDIO_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6,
  bufferSize: 4000,
  wavFile: 'asr-smoke.wav',
} as const;

function int16Base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

export default function AsrSmokeScreen() {
  // Exercises whichever engine ASR_ENGINE selects (Moonshine by default).
  const stt = useActiveAsrStream();
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const generatorRef = useRef<AsyncGenerator<{ committed: { text: string }; nonCommitted: { text: string } }, void, unknown> | null>(null);

  const log = (m: string) => setLogs((prev) => [...prev.slice(-30), m]);

  useEffect(() => {
    log(`isReady=${stt.isReady} dl=${(stt.downloadProgress * 100).toFixed(0)}%`);
  }, [stt.isReady, stt.downloadProgress]);

  useEffect(() => {
    if (stt.error) log(`error: ${stt.error.message ?? String(stt.error)}`);
  }, [stt.error]);

  async function start() {
    if (!stt.isReady) {
      log('not ready');
      return;
    }
    setTranscript('');
    LiveAudioStream.init(AUDIO_OPTIONS);
    LiveAudioStream.on('data', (b64: string) => {
      const samples = int16Base64ToFloat32(b64);
      try {
        stt.streamInsert(samples);
      } catch (e: any) {
        log(`insert err: ${e?.message ?? String(e)}`);
      }
    });
    LiveAudioStream.start();

    const gen = stt.stream();
    generatorRef.current = gen;
    setRecording(true);
    log('recording…');

    (async () => {
      try {
        for await (const { committed, nonCommitted } of gen) {
          const live = `${committed.text} ${nonCommitted.text}`.trim();
          setTranscript(live);
        }
      } catch (e: any) {
        log(`gen err: ${e?.message ?? String(e)}`);
      }
    })();
  }

  async function stop() {
    setRecording(false);
    try {
      await LiveAudioStream.stop();
    } catch (e: any) {
      log(`stop err: ${e?.message ?? String(e)}`);
    }
    try {
      stt.streamStop();
    } catch (e: any) {
      log(`streamStop err: ${e?.message ?? String(e)}`);
    }
    generatorRef.current = null;
    log('stopped');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'ASR Smoke' }} />
      <View style={styles.container}>
        <Text style={styles.label}>Engine: {ASR_ENGINE}</Text>
        <Text style={styles.label}>
          isReady: {String(stt.isReady)} · downloadProgress:{' '}
          {(stt.downloadProgress * 100).toFixed(0)}%
        </Text>
        <Button
          title={recording ? 'Stop' : 'Record'}
          onPress={recording ? stop : start}
          disabled={!stt.isReady}
        />
        <Text style={styles.heading}>Transcript</Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
          <Text style={styles.transcript}>{transcript || '—'}</Text>
        </ScrollView>
        <Text style={styles.heading}>Logs</Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
          {logs.map((l, i) => (
            <Text key={i} style={styles.logRow}>
              {l}
            </Text>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  label: { fontSize: 13, opacity: 0.7 },
  heading: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  box: { flexGrow: 0, height: 140, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  boxContent: { padding: 8 },
  transcript: { fontSize: 18, lineHeight: 24 },
  logRow: { fontSize: 11, fontFamily: 'Courier', opacity: 0.8 },
});
