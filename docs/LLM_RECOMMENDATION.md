# LLM Recommendation for Kaggle War Room

Tanggal evaluasi: 17 Mei 2026.

## Prinsip pemilihan

Karena target awal adalah model sekitar 8B atau lebih kecil, prioritasnya bukan model terbesar, melainkan:

1. cukup kuat untuk reasoning proyek Kaggle,
2. mudah dijalankan lokal,
3. murah untuk eksperimen,
4. mendukung role-based prompt,
5. cukup baik untuk coding/notebook explanation,
6. dapat dihubungkan melalui Ollama atau OpenAI-compatible endpoint.

## Rekomendasi utama

### 1. Gemma 4 E4B / Gemma 4 E2B

Alasan:
- Keluarga Gemma terbaru memiliki varian kecil/efisien.
- Cocok untuk deployment lokal dan edukasi.
- Ukuran aktif kecil membuatnya menarik untuk proyek ini.

Kapan dipakai:
- Advisor umum.
- Learning mentor.
- Project manager.
- Validasi konsep.

Catatan:
- Periksa ketersediaan runtime/Ollama/transformers karena rilis terbaru kadang belum langsung tersedia di semua tool.

### 2. Gemma 3 4B atau 12B

Alasan:
- Stabil dan populer untuk single-GPU/laptop.
- 4B lebih ringan; 12B lebih kuat jika hardware cukup.
- Baik untuk explanation, summarization, dan prompt role-based.

Kapan dipakai:
- Laptop dengan VRAM terbatas: 4B quantized.
- Workstation/GPU lebih besar: 12B quantized.

### 3. Llama 3.1 8B Instruct

Alasan:
- Baseline open-weight 8B yang matang.
- Mudah dijalankan melalui Ollama dan banyak runtime lokal.
- Baik untuk dialog umum dan reasoning instruksional.

Kapan dipakai:
- Jika ingin solusi paling mudah dijalankan sekarang.
- Jika Gemma terbaru belum tersedia di runtime lokal Anda.

### 4. Qwen coding-oriented model kecil / MoE active-parameter kecil

Alasan:
- Qwen family cenderung kuat pada coding dan agentic workflow.
- Cocok untuk notebook generation, refactor, dan debugging.

Kapan dipakai:
- Untuk role Machine Learning Engineer dan Peer Reviewer.
- Untuk membuat/mengecek template notebook.

## Rekomendasi praktis untuk MVP

Gunakan dua model, bukan satu:

1. General advisor: Gemma 4 E4B atau Llama 3.1 8B Instruct.
2. Coding advisor: Qwen coding model kecil atau model code-specialized yang tersedia di runtime Anda.

Jika ingin satu model saja:

- Pilihan aman: Llama 3.1 8B Instruct.
- Pilihan Google-oriented: Gemma 3 4B/12B atau Gemma 4 E4B jika sudah tersedia di runtime.

## Skema routing agent

```text
Maya PM              -> general model
Raka Data Engineer   -> coding/data model
Sinta EDA Analyst    -> general + code model
Bima ML Engineer     -> coding model
Nadia Validation     -> general reasoning model
Tari Storyteller     -> general model
Dimas Reviewer       -> coding + reasoning model
Lana Mentor          -> general model
```

## Konfigurasi backend contoh

### Ollama

```bash
export LLM_PROVIDER=ollama
export OLLAMA_MODEL=llama3.1:8b
uvicorn main:app --reload --port 7860
```

### OpenAI-compatible

```bash
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL=http://localhost:1234/v1
export LLM_API_KEY=optional
export LLM_MODEL=your-local-model
uvicorn main:app --reload --port 7860
```

## Kenapa tidak langsung model sangat besar?

Untuk prototipe edukatif, latensi dan biaya lebih penting daripada skor benchmark tertinggi. Project ini butuh banyak percakapan pendek, bukan satu jawaban panjang. Model kecil yang cepat akan terasa lebih hidup di kantor virtual.
