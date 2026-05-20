# Response to Revision Notes

Dokumen ini memetakan kritik terhadap tindakan revisi pada versi 2.

## 1. Ruangan terlalu tidak realistis

Perbaikan:
- Kantor diperluas menjadi dua lantai.
- Ditambahkan ceiling, panel lampu, AC/vent, glass partition, pintu kaca, frame aluminium, sofa, workstation, rak, server rack, monitor, coffee counter, tangga, lift, dan signage.
- Palet visual dibuat lebih cerah agar tidak gloomy.

Batasan:
- Model masih low-poly/procedural. Untuk realisme tingkat produksi, tahap berikutnya perlu GLTF assets dari Blender atau library asset 3D.

## 2. Panel kanan tidak bisa discroll karena pointer-lock

Perbaikan:
- Ada dua mode eksplisit: Mode First-person dan Mode UI.
- `Tab` atau `Esc` melepas mouse dari first-person.
- Tombol “Mode UI / mouse bebas” tersedia di panel.
- Panel tetap scrollable ketika pointer-lock mati.

## 3. NPC hanya chat teks di kanan

Perbaikan:
- NPC dapat diajak bicara dengan mendekati karakter dan menekan `E`.
- Jawaban NPC dibacakan menggunakan Web Speech API browser jika Voice aktif.
- Teks tetap tersedia sebagai transcript agar bisa dibaca ulang.

Batasan:
- Ini belum voice conversation dua arah penuh. Input user masih diketik. Voice input bisa ditambahkan memakai Web Speech Recognition atau Whisper pada tahap berikutnya.

## 4. Alur bingung: harus menemui siapa dulu?

Perbaikan:
- Onboarding Desk berfungsi dan memberi alur awal.
- Workflow checklist disediakan dari intake sampai post-mortem.
- Team bisa dikumpulkan ke War Room untuk debat bersama.
- Setiap role punya perspektif berbeda: PM, data, EDA, ML, validasi, storytelling, review, mentor.

## 5. Whiteboard tidak bisa dipakai

Perbaikan:
- Whiteboard menjadi dialog interaktif.
- Catatan bisa diedit, disimpan, dan diisi otomatis dari brief kompetisi.
- Ada kanban eksperimen sederhana.

## 6. Perlu LLM yang lebih serius

Perbaikan:
- Disediakan `server/main.py` sebagai backend FastAPI.
- Mendukung mode lokal Ollama dan OpenAI-compatible endpoint.
- Disediakan dokumen `LLM_RECOMMENDATION.md` untuk pemilihan model sekitar 4B–12B.

## 7. Perlu proyek lebih matang

Perbaikan:
- Struktur dokumentasi ditambah: arsitektur, roadmap, workflow Kaggle, rekomendasi LLM, dan response terhadap kritik.
- Kode dipisah menjadi modul: world rendering, advisor logic, config, dan app orchestration.
