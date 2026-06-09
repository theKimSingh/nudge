from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
from pathlib import Path
import torch
import re
import json

MODEL_PATH = Path(__file__).resolve().parent / "qwen3_0_6b_event_extractor"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

app = FastAPI()

print(f"Loading tokenizer from {MODEL_PATH}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

print(f"Loading model from {MODEL_PATH / 'model.safetensors'}...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float32,
    device_map=DEVICE
)

print(f"Model loaded on {DEVICE}!")

class ChatRequest(BaseModel):
    model: str
    messages: list
    stream: bool = False


@app.post("/v1/chat/completions")
async def chat(req: ChatRequest):

    # Build prompt
    system_msg = ""
    user_msg = ""

    for m in req.messages:
        if m["role"] == "system":
            system_msg = m["content"]
        elif m["role"] == "user":
            user_msg = m["content"]

    default_instructions = (
        "Schema for each event: "
        '{"id": null, "summary": string, '
        '"begin": "YYYY-MM-DDTHH:MM:SS", '
        '"end": "YYYY-MM-DDTHH:MM:SS", '
        '"duration": integer, '
        '"repeats": null | "daily" | "weekly" | "monthly" | "yearly" | "custom", '
        '"repeat_custom": null | string}. '
        "Use repeat_custom only when repeats is custom. "
        "Return a JSON object for one event or a JSON array for multiple events."
    )
    instructions = system_msg.strip() or default_instructions

    prompt = (
        "Task: Extract event details as raw JSON.\n"
        "Return a JSON object for one event or a JSON array for multiple events.\n"
        f"Instructions:\n{instructions}\n"
        f"Input: {json.dumps(user_msg)}\n"
        "Output: "
    )

    inputs = tokenizer(
        prompt,
        return_tensors="pt"
    ).to(DEVICE)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.0,
            do_sample=False,
            repetition_penalty=1.1,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id
        )
    # Remove prompt tokens from output
    generated_tokens = outputs[0][inputs["input_ids"].shape[1]:]

    response = tokenizer.decode(
        generated_tokens,
        skip_special_tokens=True
    ).strip()

    # Debug print
    print("\n=== RAW MODEL RESPONSE ===")
    print(response)
    print("==========================\n")

    # Remove common prefixes
    response = re.sub(r"^(Output|Answer|JSON|Response)\s*:\s*", "", response, flags=re.IGNORECASE)

    # Extract ONLY JSON portion
    json_match = re.search(r'(\{.*\}|\[.*\])', response, re.DOTALL)

    if json_match:
        response = json_match.group(1).strip()

    print("\n=== CLEANED RESPONSE ===")
    print(response)
    print("========================\n")

    return {
        "choices": [
            {
                "message": {
                    "content": response
                }
            }
        ]
    }
