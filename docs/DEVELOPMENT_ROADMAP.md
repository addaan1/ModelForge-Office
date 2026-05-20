# Development Roadmap

## Phase 1 — Playable Prototype

Target:
- Pengguna dapat berjalan di kantor 3D dua lantai.
- Pengguna dapat berbicara dengan NPC advisor.
- Whiteboard, onboarding, checklist, dan meeting berfungsi.

Status versi ini:
- Selesai sebagai prototipe playable.

## Phase 2 — LLM Integration

Target:
- Integrasi dengan backend FastAPI.
- Mode Ollama lokal.
- Mode OpenAI-compatible endpoint.
- Prompt role-based untuk tiap advisor.
- Riwayat chat per project.

Rekomendasi model awal:
- Gemma 4 E4B atau Gemma 3 4B/12B untuk general reasoning ringan.
- Llama 3.1 8B Instruct untuk baseline 8B yang matang dan mudah dijalankan.
- Qwen coding model kecil/aktif-parameter kecil untuk notebook dan coding agent.

## Phase 3 — Kaggle Tooling

Target:
- User mengisi slug/link Kaggle.
- Backend mengambil file list, competition metadata, dan submission format.
- Advisor dapat membuat data audit plan dari file yang sebenarnya.

Fitur:
- `kaggle competitions files <slug>`
- `kaggle competitions download <slug>`
- `kaggle competitions submissions <slug>`
- `kaggle competitions leaderboard <slug>`
- `kaggle competitions topics <slug>`

## Phase 4 — Experiment Operating System

Target:
- Setiap eksperimen tercatat: model, fitur, fold, metric, public LB, catatan.
- Advisor bisa membandingkan eksperimen.
- Whiteboard berubah menjadi decision dashboard.

Komponen:
- SQLite lokal.
- Experiment table.
- Artifact folders.
- Notebook template generator.

## Phase 5 — Voice and Collaboration

Target:
- User bisa berbicara langsung menggunakan microphone.
- Advisor menjawab dengan TTS yang lebih natural.
- Meeting multi-agent berjalan seperti diskusi panel.

Komponen:
- Speech-to-text lokal atau API.
- Streaming response.
- Turn-taking manager.

## Phase 6 — Realistic Production Environment

Target:
- Asset 3D lebih realistis.
- NPC beranimasi.
- Navigasi pathfinding.
- Deploy web app.

Komponen:
- Blender/GLTF assets.
- Animation mixer.
- Navmesh/pathfinding.
- PBR material dan baked lighting.

## Phase 7 - Office Rebuild Pass v2.4

Target:
- Pecah world builder menjadi modul `layout`, `props`, `signage`, `collision`, `interactions`, dan `npc`.
- Buat visual kantor modern yang lebih konsisten: kaca rapi, trim tipis, papan tulisan proporsional, warna netral, dan prop meja natural.
- Setiap room punya fungsi Kaggle yang jelas: intake, data/profile/schema, baseline/experiment, meeting decision, review before submit, dan recharge/quiz.
- Minimap naik kelas menjadi wayfinding tool yang memberi arah, bukan teleport bebas.
- Coworker punya desk/seat, waypoint aman, pose kerja yang cocok, dan schedule loop ringan.
- QA mode menampilkan spawn point, collision box, interact radius, NPC waypoint, dan room boundary.
