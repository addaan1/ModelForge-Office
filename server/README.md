# Kaggle War Room Backend

Backend ini opsional, tetapi dibutuhkan untuk:

- chat LLM sungguhan via Ollama atau OpenAI-compatible endpoint,
- Kaggle CLI analyze/download,
- Whisper speech-to-text.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set LLM_PROVIDER=auto
set OLLAMA_MODEL=gemma3:4b
uvicorn main:app --reload --port 7860
```

## Endpoints

```text
GET  /api/health
POST /api/chat
POST /api/kaggle/command
POST /api/kaggle/analyze
POST /api/transcribe
```

`/api/kaggle/analyze` request:

```json
{
  "competition": "https://www.kaggle.com/competitions/titanic",
  "download": true,
  "overwrite": false
}
```

Data disimpan ke:

```text
../data/competitions/<slug>/raw
```

Metadata disimpan ke:

```text
../data/competitions/<slug>/metadata.json
```

## Local rule mode

Default:

```bash
set LLM_PROVIDER=local-rule
```

## Ollama mode

```bash
set LLM_PROVIDER=ollama
set OLLAMA_MODEL=gemma3:4b
uvicorn main:app --reload --port 7860
```

## OpenAI-compatible mode

```bash
set LLM_PROVIDER=openai-compatible
set LLM_BASE_URL=http://localhost:1234/v1
set LLM_API_KEY=optional
set LLM_MODEL=gemma4:e2b-q4
uvicorn main:app --reload --port 7860
```

## Whisper mode

`POST /api/transcribe` menerima raw audio body dari browser, misalnya `Content-Type: audio/webm`.
Multipart form dengan field `audio` atau `file` tetap didukung jika `python-multipart` terpasang, tetapi UI utama tidak membutuhkannya.

Default environment:

```bash
set WHISPER_MODEL=base
set WHISPER_LANGUAGE=id
set WHISPER_DEVICE=cpu
set WHISPER_COMPUTE_TYPE=int8
```
