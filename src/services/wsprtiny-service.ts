/**
 * Transcribe audio using OpenAI Whisper
 * @param audioUri local file URI from expo-av recording
 */
export async function transcribeAudio(audioUri: string) {
  const formData = new FormData();

  formData.append('file', {
    uri: audioUri,
    name: 'audio.m4a',
    type: 'audio/m4a',
  } as any);

  const res = await fetch('http://localhost:3000/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error);

  return data.text;
}