from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
import json
from datetime import datetime, timedelta
from ics import Calendar, Event
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("WARNING: GEMINI_API_KEY not found in environment")
else:
    genai.configure(api_key=api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScheduleRequest(BaseModel):
    text: str

SYSTEM_PROMPT = """You are a scheduling assistant. Extract events from the user's natural language schedule.
Respond ONLY with a valid JSON array of objects. No markdown formatting, no backticks, just the raw JSON.
Each object must have:
- "title": string
- "start_time": ISO 8601 string (e.g. "2026-05-01T14:00:00")
- "end_time": ISO 8601 string (e.g. "2026-05-01T15:30:00")
- "description": string (optional notes)

If no year is specified, assume the current year is 2026.
"""

@app.post("/generate-ics", response_class=PlainTextResponse)
async def generate_ics(request: ScheduleRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        model = genai.GenerativeModel('gemini-1.5-flash', system_instruction=SYSTEM_PROMPT)
        response = model.generate_content(request.text)
        
        # Parse the JSON response
        text_content = response.text.strip()
        if text_content.startswith('```json'):
            text_content = text_content[7:-3].strip()
        elif text_content.startswith('```'):
            text_content = text_content[3:-3].strip()
            
        events_data = json.loads(text_content)
        
        # Build ICS
        cal = Calendar()
        for ed in events_data:
            e = Event()
            e.name = ed.get("title", "Event")
            e.begin = ed.get("start_time")
            e.end = ed.get("end_time")
            if "description" in ed:
                e.description = ed["description"]
            cal.events.add(e)
            
        return str(cal)
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response as JSON: {response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
