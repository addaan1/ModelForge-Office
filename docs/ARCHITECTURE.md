# Architecture

## Tujuan arsitektur

Kaggle War Room dirancang sebagai virtual office first-person yang menggabungkan:

1. Spatial learning: pengguna bergerak di kantor dan menemui advisor sesuai konteks.
2. Multi-agent reasoning: beberapa role memberi sudut pandang berbeda.
3. Project memory: brief, whiteboard, checklist, dan meeting notes tersimpan.
4. LLM-optional: aplikasi tetap bisa berjalan lokal, tetapi dapat dihubungkan ke model sungguhan.

## Frontend

Teknologi:
- HTML/CSS/JavaScript module.
- Three.js untuk 3D rendering.
- PointerLockControls untuk first-person camera.
- Web Speech API untuk TTS browser.
- localStorage untuk penyimpanan ringan.

Modul:

```text
js/config.js     : data ruangan, agent, workflow, interactive object.
js/world.js      : scene 3D, kantor, NPC, controls, interaksi spasial.
js/advisors.js   : logika advisor, meeting, state, fallback rule-based.
js/app.js        : integrasi UI, chat, dialog, voice, dan world callbacks.
```

## Backend opsional

Backend FastAPI berperan sebagai adapter agar frontend tidak langsung menyimpan credential.

Endpoint:

```text
GET  /api/health
POST /api/chat
POST /api/kaggle/command
```

Provider LLM:
- `local-rule`: fallback aman tanpa model.
- `ollama`: model lokal seperti llama3.1:8b atau Gemma yang tersedia di Ollama.
- `openai-compatible`: untuk LM Studio, vLLM, OpenRouter/self-hosted gateway, dan layanan kompatibel.

## Multi-agent design

Agent bukan sekadar nama berbeda. Setiap agent memiliki:

- role,
- expertise,
- system prompt,
- opener,
- lokasi fisik di kantor,
- gaya kritik.

Urutan meeting default:

```text
Project Manager → Data Engineer → EDA Analyst → Validation Scientist → ML Engineer → Notebook Storyteller → Peer Reviewer → Learning Mentor
```

## Kaggle integration plan

Integrasi Kaggle tidak langsung dijalankan dari browser karena token Kaggle tidak boleh disimpan di frontend.

Rancangan aman:

1. User menyimpan token Kaggle di server lokal.
2. Backend menjalankan Kaggle CLI/API.
3. Frontend hanya mengirim slug kompetisi.
4. Backend mengembalikan metadata: file list, rules summary, submission history, topics, dan leaderboard jika tersedia.

## Data model awal

```json
{
  "competition": {
    "slug": "house-prices-advanced-regression-techniques",
    "metric": "RMSE",
    "problem_type": "Tabular regression"
  },
  "workflow": [],
  "whiteboard": "...",
  "meetings": [],
  "experiments": []
}
```

## Roadmap teknis

- Phase 1: world, controls, NPC, TTS, meeting, whiteboard.
- Phase 2: real LLM backend, tool calling, Kaggle CLI metadata.
- Phase 3: experiment tracking, notebook generation, retrieval over docs/forum.
- Phase 4: real-time voice input, streamed speech output, pathfinding NPC.
- Phase 5: asset realistis berbasis Blender/GLTF dan deploy web app.
