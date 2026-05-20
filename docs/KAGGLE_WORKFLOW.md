# Kaggle Competition Workflow

Workflow ini menjadi dasar perilaku advisor di Kaggle War Room.

## 1. Competition Intake

Tujuan:
- Memahami masalah, metric, rules, deadline, data policy, external data policy, batas submission, dan format file.

Output:
- Competition brief.
- Risk register awal.
- Target milestone.

## 2. Data Audit

Tujuan:
- Mengetahui semua file, tabel, kolom, tipe data, missing values, cardinality, duplicate, dan relasi antar tabel.

Output:
- Data dictionary.
- Train/test distribution comparison.
- Leakage candidate list.

## 3. EDA Terarah

Prinsip:
- EDA tidak sekadar membuat plot.
- Setiap visual harus menjawab pertanyaan.

Output:
- 5–10 insight yang bisa diuji melalui validasi atau feature engineering.

## 4. Validation Design

Pertanyaan utama:
- Split seperti apa yang paling mendekati private leaderboard?
- Apakah ada time/group leakage?
- Apakah metric memerlukan thresholding atau calibration?

Output:
- Fold file atau split strategy yang tetap.
- Baseline score yang dapat dipercaya.

## 5. Baseline

Tujuan:
- Membuat pipeline minimal yang jalan dari train sampai submission.
- Menjadi titik acuan semua eksperimen berikutnya.

Output:
- Baseline notebook.
- Baseline CV score.
- First valid submission.

## 6. Feature Engineering

Prinsip:
- Fitur dibuat berdasarkan hipotesis EDA dan domain problem.
- Batch fitur kecil agar efeknya dapat dilacak.

Output:
- Feature log.
- Ablation result.

## 7. Model Comparison

Prinsip:
- Jangan hanya membandingkan leaderboard.
- Bandingkan CV mean, CV standard deviation, training time, inference time, dan stability.

Output:
- Model leaderboard internal.
- Keputusan model candidate.

## 8. Error Analysis

Tujuan:
- Mengetahui segmen data yang gagal.
- Mencari label noise, distribution shift, outlier, dan subgroup error.

Output:
- Error segment list.
- Actionable next experiments.

## 9. Ensembling

Prinsip:
- Ensemble masuk akal jika model memiliki error pattern berbeda.
- Ensemble yang meningkatkan public LB tetapi merusak CV harus dicurigai.

Output:
- Ensemble candidates.
- Final model package.

## 10. Submission Ritual

Checklist:
- Format submission benar.
- Urutan ID sesuai sample submission.
- Preprocessing tidak bocor.
- Seed dan versi library tercatat.
- Notebook bisa dijalankan ulang.
- Message submission informatif.

## 11. Post-Mortem

Tujuan:
- Mengubah kompetisi menjadi pembelajaran.
- Menulis apa yang berhasil, gagal, dan perlu dicoba berikutnya.
