const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 8000;
require('dotenv').config(); 
const apiKey = process.env.API_KEY;

// Enable CORS for all routes
app.use(cors());
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });
    
    const today = new Date().toISOString().split('T')[0];
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const prompt = `Today's date is ${today} and the user's timezone is ${timezone}. 
    Extract event details from the following text: '${text}'.  Keep the end of the event at 1 hour after beginning unless otherwise specified.
    Return the result in a strict JSON format with the following keys: 
    'summary', 'begin' (ISO 8601 format), 'end' (ISO 8601 format), 'description', 'location'. 
    If a field is missing, use null. Only return the JSON.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // 1. Force the model to output ONLY JSON
        responseMimeType: "application/json",
        // 2. Disable thinking blocks
        thinkingConfig: {
          thinkingLevel: "MINIMAL"
        }
      }
    });

    const response = await result.response;
    const content = response.text();

    if (!content || content.trim() === "") {
      throw new Error('Gemini API returned no content');
    }

    // Since we forced responseMimeType, we can safely parse this
    const extractedData = JSON.parse(content);
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

    // Validate URL is for calendar/ics
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

    // Return as text/plain so it can be parsed on client
    console.log('ICS DATA:\n', icsData);

    res.set('Content-Type', 'text/plain');
    res.send(icsData);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`   - GET /health - Health check`);
  console.log(`   - GET /proxy-ics?url=... - Proxy ICS URL`);
});
