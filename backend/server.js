const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const OpenAI = require('openai'); // 1. Import OpenAI instead of Gemini
require('dotenv').config(); 

const app = express();
const PORT = 8000;

// Initialize OpenAI client pointing to your local Ollama instance
const localAI = new OpenAI({
  baseURL: 'http://localhost:11434/v1', // Ollama's local OpenAI-compatible endpoint
  apiKey: 'ollama', // Required by the SDK, but ignored by Ollama
});

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/plan-day', async (req, res) => {
  try {
    const { text, date } = req.body;
    if (!text || !date) {
      return res.status(400).json({ error: 'text and date are required' });
    }

    console.log("Sending text to local Qwen model via Ollama...");
    
    // Using the 'date' passed from the frontend to ground the context properly
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const systemPrompt = `You are a helpful assistant that extracts event details. 
    Today's date is ${date} and the user's timezone is ${timezone}. 
    Extract event details from the user's text. Keep the end of the event at 1 hour after beginning unless otherwise specified.
    You MUST respond with a strict JSON object containing ONLY these keys: 
    "summary", "begin" (ISO 8601 format), "end" (ISO 8601 format), "description", "location". 
    If a field is missing or unknown, use null. Output your response strictly as a raw JSON object. Do NOT wrap it in markdown code blocks (\`\`\`json), and do not output any other text.`;

    // // Make the call to the local model
    // const response = await localAI.chat.completions.create({
    //   model: 'qwen3.5:2b', // Match the exact model name you pulled in Ollama
    //   messages: [
    //     { role: 'system', content: systemPrompt },
    //     { role: 'user', content: text }
    //   ],
    //   // Tells the model to strictly output valid JSON
    //   // response_format: { type: 'json_object' }, 
    //   temperature: 0.1, // Low temperature ensures more reliable formatting
      
    // });

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:e4b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        format: 'json', // Native Ollama direct flag
        think: false,
        stream: false,  // Disables streaming so it finishes everything first
        options: {
          temperature: 0.1,
          num_predict: 250
        }
      })
    });

    const data = await response.json();
    console.log("Raw Ollama Response Payload:", data);
    console.log("Extracted Content:", data.message.content);

    const content = data.message.content;
    console.log("Local Qwen response:", content);

    if (!content || content.trim() === "") {
      throw new Error('Local model returned no content');
    }

    const extractedData = JSON.parse(content);
    
    // Keeping your exact original response structure intact for your frontend
    res.json({ tasks: Array.of(extractedData) });

  } catch (error) {
    console.error('Plan day error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy endpoint for fetching ICS files
app.get('/proxy-ics', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    if (!url.includes('calendar') || !url.includes('ics')) {
      return res.status(400).json({ error: 'Invalid calendar URL' });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch ICS: ${response.statusText}` });
    }

    const icsData = await response.text();
    console.log('ICS DATA:\n', icsData);

    res.set('Content-Type', 'text/plain');
    res.send(icsData);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local Backend server running on http://localhost:${PORT}`);
  console.log(`   - Connected locally to Ollama (Qwen3.5)`);
});