const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = 8000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
