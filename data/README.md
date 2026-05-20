# Data Folder

Taruh data Kaggle manual di:

```text
data/competitions/<slug-kompetisi>/raw
```

Taruh notebook/script kerja di:

```text
data/competitions/<slug-kompetisi>/code
```

Coding Studio akan membaca file `.ipynb` dan `.py` dari folder `code`, menjalankannya secara safe-gated, lalu menyimpan log ke:

```text
data/competitions/<slug-kompetisi>/runs
```

Artifact seperti plot, report, atau draft submission sebaiknya disimpan ke:

```text
data/competitions/<slug-kompetisi>/outputs
```

Contoh:

```text
data/competitions/titanic/raw/train.csv
data/competitions/titanic/raw/test.csv
data/competitions/titanic/raw/sample_submission.csv
```

Kalau belum tahu slug-nya, buat folder sementara:

```text
data/competitions/manual-project/raw
```

Setelah file ada di `raw`, klik `Analisis & Download Kaggle` dengan download tidak wajib; backend akan membuat profiling ringan dan `metadata.json`.
