# Product Specification

## Product name

Kaggle War Room.

## Product vision

Membuat lingkungan virtual first-person seperti kantor riset/ML company tempat pengguna dapat memahami, merancang, menjalankan, dan merefleksikan kompetisi Kaggle dengan bantuan coworker AI yang memiliki role berbeda.

## Target user

1. Mahasiswa data science/machine learning.
2. Peserta Kaggle pemula-menengah.
3. Tim kecil yang ingin belajar alur kompetisi secara sistematis.
4. Pengguna yang sering memakai AI tetapi ingin tetap memahami prosesnya.

## Problem statement

Banyak peserta kompetisi memakai AI untuk membuat notebook atau model, tetapi tidak memahami alasan metodologis di balik keputusan seperti pemilihan metric, split validasi, feature engineering, dan submission strategy. Akibatnya pengguna mungkin memperoleh output yang berjalan, tetapi tidak membangun pemahaman yang kuat.

## Value proposition

Kaggle War Room mengubah pengalaman mengerjakan kompetisi dari chat tunggal menjadi simulasi kantor multi-role:

- pengguna bergerak ke ruangan sesuai tahap kerja,
- advisor berbeda memberi perspektif berbeda,
- keputusan disimpan di whiteboard,
- meeting multi-agent membantu membandingkan argumen,
- voice membuat interaksi terasa lebih hidup,
- backend dapat dihubungkan ke LLM lokal agar proyek tetap murah dan privat.

## Core loop

1. User memasukkan link/slug dan brief Kaggle.
2. Onboarding Desk menyarankan alur kerja.
3. User menemui advisor sesuai tahap.
4. Advisor memberi arahan dan kritik.
5. User mengumpulkan team di War Room.
6. Multi-agent debate menghasilkan keputusan.
7. Keputusan disimpan ke whiteboard dan checklist.
8. User menjalankan eksperimen di luar aplikasi atau melalui backend tooling.
9. User kembali untuk review dan iterasi.

## MVP features

- 3D first-person office.
- Dua lantai.
- Ruang kerja, data lab, model lab, glass meeting room, lounge, review room, learning studio.
- NPC advisor dengan role berbeda.
- Chat teks dan TTS browser.
- Meeting multi-agent.
- Interactive whiteboard.
- Competition intake.
- Workflow checklist.
- Optional backend LLM adapter.

## Non-goals untuk MVP

- Bukan pengganti Kaggle Notebook.
- Belum menjalankan training model otomatis.
- Belum voice input penuh.
- Belum asset 3D fotorealistis.
- Belum multiplayer realtime.

## Success criteria

Versi MVP dianggap berhasil jika:

- user dapat memahami urutan kerja Kaggle tanpa bingung;
- user dapat bertanya ke role yang relevan;
- user dapat mengumpulkan advisor untuk debat strategi;
- user dapat menyimpan keputusan di whiteboard;
- user dapat menghubungkan backend LLM tanpa mengubah frontend besar-besaran.
