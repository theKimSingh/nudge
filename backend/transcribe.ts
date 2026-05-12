import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseForm(req: VercelRequest): Promise<{ file: any }> {
  const form = new formidable.IncomingForm();

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files: any) => {
      if (err) return reject(err);
      resolve({ file: files.file });
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { file } = await parseForm(req);

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const audioFile = Array.isArray(file) ? file[0] : file;

    if (!audioFile?.filepath) {
      return res.status(400).json({ error: 'Invalid file upload' });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: 'whisper-1',
    });

    return res.status(200).json({ text: transcription.text });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}