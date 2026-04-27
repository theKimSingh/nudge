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

class PlanDayRequest(BaseModel):
    text: str
    date: str  # YYYY-MM-DD — the day the plan should land on

SYSTEM_PROMPT = """You are a scheduling assistant. Extract events from the user's natural language schedule.
Respond ONLY with a valid JSON array of objects. No markdown formatting, no backticks, just the raw JSON.
Each object must have:
- "title": string
- "start_time": ISO 8601 string (e.g. "2026-05-01T14:00:00")
- "end_time": ISO 8601 string (e.g. "2026-05-01T15:30:00")
- "description": string (optional notes)

If no year is specified, assume the current year is 2026.
"""

PLAN_DAY_PROMPT = """You plan a single day's schedule from a user's natural-language description.

Output ONLY a raw JSON object — no markdown, no backticks, no commentary. Schema:
{
  "tasks": [
    {"title": string, "start_time": "YYYY-MM-DDTHH:MM:SS", "duration_minutes": integer}
  ]
}

Rules:
1. Use the EXACT date the user is given (provided in the user message). All start_time values must use that date.
2. Honor explicit times the user states. Otherwise infer reasonable times.
3. Default working window 7:00–22:00 unless the user implies otherwise.
4. Insert breakfast (~30 min near 8:00), lunch (~30 min around 12:00–13:00), and dinner (~45 min around 18:00–19:00) UNLESS the user says they're skipping a meal.
5. Respect ordering constraints (e.g. "gym before classes" → gym ends strictly before any class starts).
6. For long focus blocks (>=90 min), include a ~15 min break afterwards when feasible.
7. No time overlaps. If a constraint cannot be fully satisfied, choose the assignment that respects the most explicit constraints.
8. Titles: short (1–4 words), no emojis, no time embedded in the title.
9. Duration in whole minutes, minimum 5.
10. Sort tasks ascending by start_time.
"""


@app.post("/plan-day")
async def plan_day(request: PlanDayRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    response = None
    try:
        model = genai.GenerativeModel(
            'gemini-2.5-flash-lite',
            system_instruction=PLAN_DAY_PROMPT,
            generation_config={"response_mime_type": "application/json"},
        )
        prompt = f"Date: {request.date}\n\nUser's plan:\n{request.text}"
        response = model.generate_content(prompt)

        text_content = response.text.strip()
        if text_content.startswith('```json'):
            text_content = text_content[7:-3].strip()
        elif text_content.startswith('```'):
            text_content = text_content[3:-3].strip()

        data = json.loads(text_content)
        # Gemini sometimes returns a bare array, sometimes the wrapped object.
        # Normalize to {"tasks": [...]}.
        if isinstance(data, list):
            return {"tasks": data}
        if isinstance(data, dict):
            if "tasks" in data and isinstance(data["tasks"], list):
                return data
            # Some responses come back as {"schedule": [...]} or similar.
            for key in ("schedule", "events", "items"):
                if key in data and isinstance(data[key], list):
                    return {"tasks": data[key]}
        raise ValueError(f"Unexpected response shape: {type(data).__name__}")

    except json.JSONDecodeError:
        raw = response.text if response else "(no response)"
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response as JSON: {raw}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-ics", response_class=PlainTextResponse)
async def generate_ics(request: ScheduleRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=SYSTEM_PROMPT)
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
