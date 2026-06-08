# training_lstm

Local training and evaluation workspace for the Qwen event-extraction model.

This folder contains:

- `finetuning_qwen.ipynb` - notebook for fine-tuning the Qwen event extractor.
- `serve_qwen.py` - FastAPI server that loads the local fine-tuned model and exposes an OpenAI-style chat completion endpoint.
- `ollama.js` - Node test runner that sends event-extraction prompts to the local Qwen server and checks responses against a synthetic dataset.
- `requirements.txt` - Python dependencies for serving/training.
- `package.json` - Node dependencies for the test runner.
- `.env.example` - example local runtime configuration.

## Setup

From this directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
cp .env.example .env
```

## Model Files

`serve_qwen.py` expects the fine-tuned model to live at:

```text
training_lstm/qwen3_0_6b_event_extractor/
```

That directory should contain the Hugging Face model/tokenizer files produced by the fine-tuning notebook, including files such as `model.safetensors`, tokenizer config, and model config files.

## Run The Local Qwen Server

Start the FastAPI server from this directory:

```bash
source .venv/bin/activate
uvicorn serve_qwen:app --host 127.0.0.1 --port 8000
```

The server exposes:

```text
POST http://127.0.0.1:8000/v1/chat/completions
```

The response shape matches the part of the OpenAI chat-completions format used by the test runner:

```json
{
  "choices": [
    {
      "message": {
        "content": "{...json...}"
      }
    }
  ]
}
```

## Environment Variables

Copy `.env.example` to `.env` and adjust values as needed:

```text
QWEN_LOCAL_BASE_URL=http://127.0.0.1:8000
QWEN_MODEL_NAME=qwen/Qwen-3.0-0.6b
```

`ollama.js` reads these values when calling the local Qwen runtime.

## Run The Test Suite

With the Qwen server running in another terminal:

```bash
node ollama.js
```

The test runner expects a dataset file at:

```text
training_lstm/synthetic_event_extraction_dataset.json
```

That file should be a JSON array where each case has an `input` string and an `output` event object. Each event should include `begin`, `end`, and `duration`:

```json
{
  "input": "I have class from eight thirty to nine twenty on Monday",
  "output": {
    "id": null,
    "summary": "Class",
    "begin": "2026-06-08T08:30:00",
    "end": "2026-06-08T09:20:00",
    "duration": 50,
    "repeats": null
  }
}
```

The runner uses a fixed mock date of `2026-05-20` for deterministic relative-date checks.

## Notes

- The Python server uses Apple Metal (`mps`) when available, otherwise CPU.
- The generation path is deterministic: `temperature=0.0` and `do_sample=false`.
- `.venv/` is ignored by git from the repo-level `.gitignore`.
