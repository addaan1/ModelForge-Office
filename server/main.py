"""FastAPI backend adapter for Kaggle War Room.

This server is optional. The frontend can run without it using local rule-based advisors.
Use this backend when you want to connect the virtual office to a real LLM, Kaggle CLI,
or local Whisper speech-to-text.
"""
from __future__ import annotations

import csv
import json
import os
import re
import shutil
import shlex
import site
import subprocess
import sys
import sysconfig
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Kaggle War Room Backend"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_ROOT = PROJECT_ROOT / "data"

app = FastAPI(title=APP_NAME, version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AgentPayload(BaseModel):
    id: str
    name: str
    role: str
    system: str = ""


class ChatRequest(BaseModel):
    model: Optional[str] = None
    agent: AgentPayload
    message: str = Field(min_length=1)
    context: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    answer: str
    provider: str
    model: str


class KaggleCommandRequest(BaseModel):
    command: str = Field(description="Allowed logical command: files/download/submissions/leaderboard/topics")
    competition: str = Field(description="Kaggle competition slug, e.g. titanic")
    extra_args: List[str] = Field(default_factory=list)


class KaggleAnalyzeRequest(BaseModel):
    competition: str = Field(min_length=1, description="Kaggle competition URL or slug")
    download: bool = True
    overwrite: bool = False


class WorkspaceRequest(BaseModel):
    competition: str = Field(min_length=1)


class WorkspaceTemplateRequest(BaseModel):
    competition: str = Field(min_length=1)
    template: str = Field(pattern="^(eda|baseline|modeling|submission)$")


class WorkspaceRunRequest(BaseModel):
    competition: str = Field(min_length=1)
    path: str = Field(min_length=1)
    timeout_seconds: int = Field(default=120, ge=5, le=600)


def data_root() -> Path:
    return Path(os.getenv("KWR_DATA_ROOT", str(DEFAULT_DATA_ROOT))).resolve()


def extract_competition_slug(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Competition slug is required")
    if ".." in raw.replace("\\", "/").split("/"):
        raise ValueError("Invalid competition slug")

    parsed = urlparse(raw if "://" in raw else f"https://kaggle.local/{raw}")
    parts = [part for part in parsed.path.split("/") if part]
    if "://" not in raw and len(parts) > 1:
        raise ValueError("Invalid competition slug")
    slug = ""
    if "competitions" in parts:
        idx = parts.index("competitions")
        if idx + 1 < len(parts):
            slug = parts[idx + 1]
    if not slug and parts:
        slug = parts[-1]
    if not slug:
        slug = raw
    if not re.fullmatch(r"[A-Za-z0-9_-]+", slug):
        raise ValueError("Invalid competition slug")
    return slug


def competition_paths(slug: str, root: Path | None = None) -> Dict[str, Path]:
    base = (root or data_root()).resolve()
    project_root = (base / "competitions" / slug).resolve()
    if not str(project_root).startswith(str(base)):
        raise ValueError("Resolved competition path escapes data root")
    return {
        "root": project_root,
        "raw": project_root / "raw",
        "code": project_root / "code",
        "outputs": project_root / "outputs",
        "runs": project_root / "runs",
        "metadata": project_root / "metadata.json",
    }


def size_human(size_bytes: int | float | None) -> str:
    if size_bytes is None:
        return "unknown"
    size = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024


def safe_project_relative_path(project_root: Path, relative_path: str, allowed_prefixes: tuple[str, ...]) -> Path:
    clean = str(relative_path or "").replace("\\", "/").lstrip("/")
    if not clean or ".." in clean.split("/"):
        raise HTTPException(status_code=400, detail="Invalid workspace path")
    if not clean.startswith(allowed_prefixes):
        raise HTTPException(status_code=400, detail="Path must stay inside an allowed workspace folder")
    target = (project_root / clean).resolve()
    if not str(target).startswith(str(project_root.resolve())):
        raise HTTPException(status_code=400, detail="Resolved path escapes project workspace")
    return target


def write_metadata_file(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_workspace(slug: str) -> Dict[str, Path]:
    paths = competition_paths(slug)
    for key in ["root", "raw", "code", "outputs", "runs"]:
      paths[key].mkdir(parents=True, exist_ok=True)
    return paths


def summarize_code_file(path: Path, root: Path) -> Dict[str, Any]:
    rel = path.relative_to(root).as_posix()
    stat = path.stat()
    item: Dict[str, Any] = {
        "path": rel,
        "name": path.name,
        "suffix": path.suffix.lower(),
        "size_bytes": stat.st_size,
        "size_human": size_human(stat.st_size),
        "modified": stat.st_mtime,
    }
    try:
        if path.suffix.lower() == ".ipynb":
            data = json.loads(path.read_text(encoding="utf-8"))
            cells = data.get("cells", [])
            item["cells"] = len(cells)
            item["preview"] = "\n".join(
                "".join(cell.get("source", []))[:800]
                for cell in cells[:3]
                if isinstance(cell, dict)
            )[:1600]
        else:
            item["preview"] = path.read_text(encoding="utf-8", errors="replace")[:1600]
    except Exception as exc:
        item["preview_error"] = str(exc)
    return item


def list_workspace_files(paths: Dict[str, Path]) -> Dict[str, Any]:
    root = paths["root"]
    code_files = [
        summarize_code_file(path, root)
        for path in sorted(paths["code"].rglob("*"))
        if path.is_file() and path.suffix.lower() in {".py", ".ipynb"}
    ][:80]
    outputs = [
        {"path": path.relative_to(root).as_posix(), "size_bytes": path.stat().st_size, "size_human": size_human(path.stat().st_size)}
        for path in sorted(paths["outputs"].rglob("*"))
        if path.is_file()
    ][:80]
    runs = [
        {"path": path.relative_to(root).as_posix(), "modified": path.stat().st_mtime, "size_bytes": path.stat().st_size}
        for path in sorted(paths["runs"].glob("*.json"), reverse=True)
        if path.is_file()
    ][:40]
    latest_run = None
    if runs:
        try:
            latest_run = json.loads((root / runs[0]["path"]).read_text(encoding="utf-8"))
        except Exception:
            latest_run = None
    return {"code_files": code_files, "outputs": outputs, "runs": runs, "latest_run": latest_run}


def notebook_template(slug: str, template: str) -> Dict[str, Any]:
    titles = {
        "eda": "EDA and Data Audit",
        "baseline": "Baseline Model",
        "modeling": "Modeling Experiments",
        "submission": "Submission Builder",
    }
    code = {
        "eda": "from pathlib import Path\nimport pandas as pd\nRAW = Path('../raw')\nprint('Raw files:', [p.name for p in RAW.glob('*')])\ntrain = pd.read_csv(RAW / 'train.csv')\nprint(train.shape)\ntrain.head()",
        "baseline": "from pathlib import Path\nimport pandas as pd\nRAW = Path('../raw')\ntrain = pd.read_csv(RAW / 'train.csv')\ntest = pd.read_csv(RAW / 'test.csv')\nprint('train', train.shape, 'test', test.shape)\n# TODO: define target, validation split, and baseline model",
        "modeling": "from pathlib import Path\nimport pandas as pd\nRAW = Path('../raw')\nprint('Modeling workspace ready for', RAW.resolve())\n# TODO: load features, run folds, save metrics to ../outputs",
        "submission": "from pathlib import Path\nimport pandas as pd\nRAW = Path('../raw')\nOUT = Path('../outputs')\nOUT.mkdir(exist_ok=True)\nsample = pd.read_csv(RAW / 'sample_submission.csv')\nprint(sample.head())\n# TODO: fill predictions and save submission.csv",
    }[template]
    return {
        "cells": [
            {"cell_type": "markdown", "metadata": {}, "source": [f"# {titles[template]}\n", f"Project: `{slug}`\n"]},
            {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": code.splitlines(True)}
        ],
        "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def notebook_to_python(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    chunks = []
    for cell in data.get("cells", []):
        if isinstance(cell, dict) and cell.get("cell_type") == "code":
            source = cell.get("source", "")
            chunks.append("".join(source) if isinstance(source, list) else str(source))
    return "\n\n".join(chunks)


def profile_downloaded_data(raw_path: Path) -> Dict[str, Any]:
    raw_path = Path(raw_path)
    files = sorted([path for path in raw_path.rglob("*") if path.is_file()]) if raw_path.exists() else []
    tables: List[Dict[str, Any]] = []
    file_summaries: List[Dict[str, Any]] = []

    for path in files[:80]:
        rel = path.relative_to(raw_path).as_posix()
        file_size = path.stat().st_size
        summary = {"name": rel, "size_bytes": file_size, "size_human": size_human(file_size)}
        file_summaries.append(summary)
        if path.suffix.lower() != ".csv":
            continue
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                columns = list(reader.fieldnames or [])
                rows = 0
                missing = {column: 0 for column in columns}
                sample: List[Dict[str, str]] = []
                for row in reader:
                    rows += 1
                    if rows <= 5:
                        sample.append({key: row.get(key, "") for key in columns[:12]})
                    if rows <= 1000:
                        for column in columns:
                            if row.get(column, "") == "":
                                missing[column] += 1
                tables.append({
                    "name": rel,
                    "rows": rows,
                    "columns": columns,
                    "sample": sample,
                    "missing_first_1000": missing,
                    "size_bytes": file_size,
                    "size_human": size_human(file_size),
                })
        except UnicodeDecodeError:
            tables.append({"name": rel, "error": "CSV is not UTF-8 decodable", "size_bytes": file_size, "size_human": size_human(file_size)})
        except csv.Error as exc:
            tables.append({"name": rel, "error": f"CSV parse error: {exc}", "size_bytes": file_size, "size_human": size_human(file_size)})

    return {
        "files_scanned": len(files),
        "files": file_summaries,
        "tables": tables,
    }


def parse_kaggle_files_output(stdout: str) -> List[Dict[str, Any]]:
    text = (stdout or "").strip()
    if not text:
        return []
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    try:
        reader = csv.DictReader(lines)
        if reader.fieldnames and any(name.lower() in {"name", "file", "ref"} for name in reader.fieldnames):
            rows = []
            for row in reader:
                clean = {str(k).strip(): str(v).strip() for k, v in row.items() if k is not None}
                if clean:
                    clean.setdefault("name", clean.get("ref") or clean.get("file") or next(iter(clean.values()), ""))
                    rows.append(clean)
            return rows
    except csv.Error:
        pass

    rows = []
    for line in lines:
        if line.lower().startswith(("name", "---")):
            continue
        parts = line.split()
        if parts:
            rows.append({"name": parts[0], "raw": line})
    return rows


def summarize_kaggle_error(stderr: str, stdout: str = "") -> str:
    text = (stderr or stdout or "Kaggle command failed").strip()
    lower = text.lower()
    if "could not find kaggle.json" in lower:
        return f"Kaggle credentials are not configured. Place kaggle.json in {Path.home() / '.kaggle'} or set KAGGLE_USERNAME and KAGGLE_KEY."
    if "403" in lower or "forbidden" in lower:
        return "Kaggle access was denied. Accept the competition rules on Kaggle, then try again."
    if "404" in lower or "not found" in lower:
        return "Kaggle competition was not found. Check the competition slug or URL."
    if "terms" in lower or "rules" in lower:
        return "Kaggle requires competition rules/terms confirmation before data access."
    lines = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("File ")]
    return (lines[-1] if lines else text)[-1000:]


def ensure_ffmpeg_on_path() -> Optional[str]:
    found = shutil.which("ffmpeg")
    if found:
        return found
    winget_root = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    candidates = sorted(winget_root.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"), reverse=True)
    if not candidates:
        return None
    ffmpeg = candidates[0]
    os.environ["PATH"] = f"{ffmpeg.parent}{os.pathsep}{os.environ.get('PATH', '')}"
    return str(ffmpeg)


def kaggle_command_prefix() -> List[str]:
    found = shutil.which("kaggle")
    if found:
        return [found]
    py_tag = f"Python{sys.version_info.major}{sys.version_info.minor}"
    user_site_parent = Path(site.getusersitepackages()).parent
    candidates = [
        Path(sysconfig.get_path("scripts") or "") / "kaggle.exe",
        Path(sysconfig.get_path("scripts") or "") / "kaggle",
        Path(site.USER_BASE) / "Scripts" / "kaggle.exe",
        Path(site.USER_BASE) / "Scripts" / "kaggle",
        Path(site.USER_BASE) / py_tag / "Scripts" / "kaggle.exe",
        Path(site.USER_BASE) / py_tag / "Scripts" / "kaggle",
        user_site_parent / "Scripts" / "kaggle.exe",
        user_site_parent / "Scripts" / "kaggle",
        Path(sys.executable).parent / "Scripts" / "kaggle.exe",
        Path(sys.executable).parent / "Scripts" / "kaggle",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return [str(candidate)]
    return ["kaggle"]


def run_kaggle_cli(command_key: str, slug: str, extra_args: List[str] | None = None, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    if command_key not in ALLOWED_KAGGLE_COMMANDS:
        raise ValueError("Command not allowed")
    safe_extra = [arg for arg in (extra_args or []) if isinstance(arg, str) and len(arg) <= 240]
    cmd = kaggle_command_prefix() + [*ALLOWED_KAGGLE_COMMANDS[command_key].split(), slug, *safe_extra]
    return subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)


def build_system_prompt(req: ChatRequest) -> str:
    workflow = req.context.get("workflow", [])
    workflow_text = "\n".join(
        f"- {item.get('title')}: {item.get('detail')}" for item in workflow if isinstance(item, dict)
    )
    brief = req.context.get("briefText") or "Belum ada brief detail."
    problem = req.context.get("problemType") or "Belum dianalisis"
    link = req.context.get("competitionLink") or "Belum diisi"
    metadata = req.context.get("kaggle_metadata") or {}
    data_profile = req.context.get("data_profile") or metadata.get("data_profile") or {}
    whiteboard = req.context.get("whiteboard") or ""
    experiments = req.context.get("experiment_log") or []
    workspace_files = req.context.get("workspace_files") or []
    latest_run = req.context.get("latest_run") or {}
    notebook_summary = req.context.get("notebook_summary") or ""
    code_summary = req.context.get("code_summary") or ""
    return f"""
Anda adalah {req.agent.name}, role: {req.agent.role}.
{req.agent.system}

Konteks project Kaggle:
- Link/slug: {link}
- Jenis problem: {problem}
- Brief user: {brief}
- Metadata Kaggle: {json.dumps(metadata, ensure_ascii=False)[:4000]}
- Profil data lokal: {json.dumps(data_profile, ensure_ascii=False)[:4000]}
- Workspace code/notebook: {json.dumps(workspace_files, ensure_ascii=False)[:2500]}
- Latest run: {json.dumps(latest_run, ensure_ascii=False)[:2000]}
- Notebook summary: {notebook_summary[:1500]}
- Code summary: {code_summary[:1500]}
- Whiteboard: {whiteboard[:2000]}
- Experiment log: {json.dumps(experiments, ensure_ascii=False)[:2000]}

Workflow resmi tim:
{workflow_text}

Jawab dalam bahasa Indonesia formal tetapi natural. Berikan keputusan, risiko, dan langkah praktis. Jangan mengarang fakta kompetisi jika metadata belum diberikan. Jika menyebut ukuran file/dataset, gunakan hanya size_human/size_bytes yang ada di metadata; jika tidak tersedia, tulis "belum tersedia" atau "unknown", jangan menebak GB/MB. Jika butuh data, minta user menjalankan analisis Kaggle atau memasukkan file lokal.
""".strip()


def normalize_ollama_model_name(value: Optional[str]) -> str:
    raw = (value or "").strip()
    default = os.getenv("OLLAMA_MODEL", "gemma3:4b").strip() or "gemma3:4b"
    if not raw:
        return default
    compact = re.sub(r"\s+", " ", raw.lower())
    if "gemma" in compact and "3" in compact and "4b" in compact:
        return "gemma3:4b"
    if "llama" in compact and "3.1" in compact and "8b" in compact:
        return "llama3.1:8b"
    if "qwen" in compact and "coder" in compact:
        return "qwen2.5-coder:7b"
    if re.fullmatch(r"[A-Za-z0-9._:/-]+", raw):
        return raw
    return default


def choose_ollama_model(requested: str, installed: set[str]) -> str:
    default = normalize_ollama_model_name(os.getenv("OLLAMA_MODEL", "gemma3:4b"))
    candidates = [requested, default]
    for name in installed:
        if name.startswith("gemma3:4b"):
            candidates.append(name)
    candidates.extend(sorted(installed))
    for candidate in candidates:
        if not candidate:
            continue
        if candidate in installed:
            return candidate
        matches = [name for name in installed if name.split(":")[0] == candidate.split(":")[0]]
        if matches:
            return sorted(matches)[0]
    raise HTTPException(status_code=502, detail=f"Ollama model not found. Installed models: {', '.join(sorted(installed)) or 'none'}")


async def call_ollama(req: ChatRequest) -> ChatResponse:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = normalize_ollama_model_name(req.model)
    tags_timeout = float(os.getenv("OLLAMA_TAGS_TIMEOUT", "4"))
    chat_timeout = float(os.getenv("OLLAMA_CHAT_TIMEOUT", "120"))
    async with httpx.AsyncClient(timeout=tags_timeout) as client:
        tags_response = await client.get(f"{host.rstrip('/')}/api/tags")
    if tags_response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Ollama tags error: {tags_response.text[:500]}")
    tags = tags_response.json().get("models", [])
    names = {item.get("name", "") for item in tags if isinstance(item, dict)}
    model = choose_ollama_model(model, names)

    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": build_system_prompt(req)},
            {"role": "user", "content": req.message},
        ],
        "options": {
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.4")),
            "num_ctx": int(os.getenv("LLM_CONTEXT", "8192")),
        },
    }

    async with httpx.AsyncClient(timeout=chat_timeout) as client:
        response = await client.post(f"{host.rstrip('/')}/api/chat", json=payload)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Ollama error: {response.text[:500]}")
    data = response.json()
    answer = data.get("message", {}).get("content") or data.get("response")
    if not answer:
        raise HTTPException(status_code=502, detail="Ollama returned no answer")
    return ChatResponse(answer=answer, provider="ollama", model=model)


async def call_openai_compatible(req: ChatRequest) -> ChatResponse:
    base_url = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1").rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "not-needed")
    model = req.model or os.getenv("LLM_MODEL", "gemma4:e2b-q4")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": build_system_prompt(req)},
            {"role": "user", "content": req.message},
        ],
        "temperature": float(os.getenv("LLM_TEMPERATURE", "0.4")),
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(f"{base_url}/chat/completions", json=payload, headers=headers)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"LLM endpoint error: {response.text[:500]}")
    data = response.json()
    answer = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not answer:
        raise HTTPException(status_code=502, detail="OpenAI-compatible endpoint returned no answer")
    return ChatResponse(answer=answer, provider="openai-compatible", model=model)


def call_local_rule(req: ChatRequest) -> ChatResponse:
    model = "local-rule"
    context = req.context or {}
    project = context.get("current_project") or {}
    metadata = context.get("kaggle_metadata") or {}
    profile = context.get("data_profile") or metadata.get("data_profile") or {}
    files = metadata.get("files") or profile.get("files") or []
    tables = profile.get("tables") or []
    workspace_files = context.get("workspace_files") or []
    latest_run = context.get("latest_run") or {}
    slug = metadata.get("slug") or project.get("slug") or "belum dipilih"
    def _file_label(item: Any) -> str:
        if isinstance(item, dict):
            return str(item.get("name") or item.get("ref") or item.get("raw") or "file")
        return str(item)

    def _table_label(table: Dict[str, Any]) -> str:
        columns = table.get("columns")
        col_count = len(columns) if isinstance(columns, list) else (columns if columns not in (None, "") else "?")
        rows = table.get("rows")
        row_count = rows if rows not in (None, "") else "?"
        size = table.get("size_human") or "size unknown"
        return f"{table.get('name', 'table')} ({row_count} rows, {col_count} cols, {size})"

    file_names = ", ".join(_file_label(item) for item in files[:6])
    table_summary = ", ".join(
        _table_label(table)
        for table in tables[:4]
        if isinstance(table, dict)
    )
    workspace_summary = ", ".join(
        str(item.get("path") or item.get("name"))
        for item in workspace_files[:5]
        if isinstance(item, dict)
    )
    user_message = req.message.lower()
    if any(word in user_message for word in ["pakai model", "llm", "model llm", "backend"]):
        answer = (
            "Backend /api/chat sudah terpanggil, tetapi provider masih local-rule karena Ollama atau model LLM belum berhasil menjawab.\n\n"
            f"Provider aktif: {os.getenv('LLM_PROVIDER', 'auto')}. Model Ollama yang dicoba: {os.getenv('OLLAMA_MODEL', 'gemma3:4b')}.\n\n"
            "Kalau ingin LLM sungguhan, pastikan Ollama berjalan dan modelnya sudah ada, misalnya: ollama pull gemma3:4b. "
            "Setelah itu jalankan ulang run_windows.bat. Di frontend, jawaban yang benar akan diawali [LLM: ollama / gemma3:4b]."
        )
        return ChatResponse(answer=answer, provider="local-rule", model=model)

    answer = (
        f"Saya {req.agent.name} ({req.agent.role}). Backend /api/chat sudah terpanggil, tetapi masih fallback local-rule.\n\n"
        f"Kompetisi: {slug}.\n"
        f"File terdeteksi: {file_names or 'belum ada file yang terbaca'}.\n"
        f"Profil data: {table_summary or 'belum ada metadata tabel'}.\n\n"
        f"Workspace code: {workspace_summary or 'belum ada notebook/script di folder code'}.\n"
        f"Latest run: {latest_run.get('status', 'belum ada run') if isinstance(latest_run, dict) else 'belum ada run'}.\n\n"
        "Kalau Ollama aktif, set LLM_PROVIDER=auto atau LLM_PROVIDER=ollama dan pakai model gemma3:4b. "
        "Jika memakai LM Studio/OpenAI-compatible, set LLM_PROVIDER=openai-compatible dan LLM_BASE_URL.\n\n"
        "Saran praktis sekarang: jalankan analisis Kaggle, kunci metric, audit file kompetisi, tentukan split validasi, buat baseline reproducible, lalu eksperimen bertahap."
    )
    return ChatResponse(answer=answer, provider="local-rule", model=model)


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "app": APP_NAME,
        "provider": os.getenv("LLM_PROVIDER", "auto"),
        "model": os.getenv("OLLAMA_MODEL") or os.getenv("LLM_MODEL", "gemma3:4b"),
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    provider = os.getenv("LLM_PROVIDER", "auto").lower().strip()
    if provider == "auto":
        try:
            return await call_ollama(req)
        except (httpx.HTTPError, HTTPException):
            return call_local_rule(req)
    if provider == "ollama":
        return await call_ollama(req)
    if provider in {"openai-compatible", "openai_compatible", "openai"}:
        return await call_openai_compatible(req)
    return call_local_rule(req)


ALLOWED_KAGGLE_COMMANDS = {
    "files": "competitions files",
    "download": "competitions download",
    "submissions": "competitions submissions",
    "leaderboard": "competitions leaderboard",
    "topics": "competitions topics",
}


def validate_slug(slug: str) -> str:
    try:
        return extract_competition_slug(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/kaggle/command")
def kaggle_command(req: KaggleCommandRequest) -> Dict[str, Any]:
    """Run a constrained Kaggle CLI command.

    This endpoint intentionally allows only a small command set.
    Do not expose this server publicly without authentication.
    """
    command_key = req.command.lower().strip()
    if command_key not in ALLOWED_KAGGLE_COMMANDS:
        raise HTTPException(status_code=400, detail="Command not allowed")
    slug = validate_slug(req.competition)
    safe_extra = [arg for arg in req.extra_args if isinstance(arg, str) and len(arg) <= 80]
    base = [*kaggle_command_prefix(), *ALLOWED_KAGGLE_COMMANDS[command_key].split(), slug]
    cmd = base + safe_extra
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Kaggle package is not available for this Python")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Kaggle command timed out")
    return {
        "command": " ".join(shlex.quote(part) for part in cmd),
        "returncode": completed.returncode,
        "stdout": completed.stdout[-8000:],
        "stderr": summarize_kaggle_error(completed.stderr, completed.stdout) if completed.returncode != 0 else "",
    }


@app.post("/api/kaggle/analyze")
def kaggle_analyze(req: KaggleAnalyzeRequest) -> Dict[str, Any]:
    slug = validate_slug(req.competition)
    paths = competition_paths(slug)
    paths["root"].mkdir(parents=True, exist_ok=True)
    warnings: List[str] = []
    files: List[Dict[str, Any]] = []
    metadata: Dict[str, Any] = {
        "source": "kaggle-cli",
        "download_requested": req.download,
        "overwrite": req.overwrite,
    }

    try:
        file_result = run_kaggle_cli("files", slug, ["-v", "-q"], timeout=120)
        metadata["files_returncode"] = file_result.returncode
        if file_result.returncode == 0:
            files = parse_kaggle_files_output(file_result.stdout)
        else:
            warnings.append(summarize_kaggle_error(file_result.stderr, file_result.stdout))
    except FileNotFoundError:
        warnings.append("Kaggle package is not available for this Python. Run `python -m pip install kaggle` and configure kaggle.json before auto-download.")
    except subprocess.TimeoutExpired:
        warnings.append("Kaggle files command timed out.")

    if req.download and not any("not installed" in warning.lower() for warning in warnings):
        paths["raw"].mkdir(parents=True, exist_ok=True)
        extra = ["-p", str(paths["raw"]), "-q"]
        if req.overwrite:
            extra.append("-o")
        try:
            download_result = run_kaggle_cli("download", slug, extra, timeout=600)
            metadata["download_returncode"] = download_result.returncode
            if download_result.returncode != 0:
                warnings.append(summarize_kaggle_error(download_result.stderr, download_result.stdout))
        except FileNotFoundError:
            warnings.append("Kaggle package is not available for this Python. Download skipped.")
        except subprocess.TimeoutExpired:
            warnings.append("Kaggle download command timed out.")

    data_profile = profile_downloaded_data(paths["raw"])
    if not files and data_profile.get("files"):
        files = list(data_profile.get("files") or [])
        metadata["files_source"] = "local_raw_profile"
    download_path = str(paths["raw"]) if data_profile["files_scanned"] > 0 else ""
    warning_text = " ".join(warnings).lower()
    payload = {
        "slug": slug,
        "files": files,
        "download_path": download_path,
        "metadata": metadata,
        "data_profile": data_profile,
        "warnings": warnings,
        "needs_user_confirmation": any(token in warning_text for token in ["403", "forbidden", "rules", "terms", "credential", "kaggle.json"]),
    }
    write_metadata_file(paths["metadata"], payload)
    return payload


@app.post("/api/workspace/scan")
def workspace_scan(req: WorkspaceRequest) -> Dict[str, Any]:
    slug = validate_slug(req.competition)
    paths = ensure_workspace(slug)
    files = list_workspace_files(paths)
    return {
        "slug": slug,
        "paths": {key: str(paths[key]) for key in ["root", "raw", "code", "outputs", "runs"]},
        "warnings": [],
        **files,
    }


@app.post("/api/workspace/create-template")
def workspace_create_template(req: WorkspaceTemplateRequest) -> Dict[str, Any]:
    slug = validate_slug(req.competition)
    paths = ensure_workspace(slug)
    names = {
        "eda": "01_eda.ipynb",
        "baseline": "02_baseline.ipynb",
        "modeling": "03_modeling.ipynb",
        "submission": "04_submission.ipynb",
    }
    target = paths["code"] / names[req.template]
    if not str(target.resolve()).startswith(str(paths["root"].resolve())):
        raise HTTPException(status_code=400, detail="Template path escapes workspace")
    if not target.exists():
        target.write_text(json.dumps(notebook_template(slug, req.template), ensure_ascii=False, indent=2), encoding="utf-8")
    return {"slug": slug, "path": target.relative_to(paths["root"]).as_posix(), **list_workspace_files(paths)}


@app.post("/api/workspace/run")
def workspace_run(req: WorkspaceRunRequest) -> Dict[str, Any]:
    slug = validate_slug(req.competition)
    paths = ensure_workspace(slug)
    target = safe_project_relative_path(paths["root"], req.path, ("code/",))
    if not target.exists() or target.suffix.lower() not in {".py", ".ipynb"}:
        raise HTTPException(status_code=400, detail="Only existing .py or .ipynb files inside code can be run")

    started = time.time()
    command_path = target
    temp_py: Path | None = None
    if target.suffix.lower() == ".ipynb":
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
        temp_py = Path(temp.name)
        temp.write(notebook_to_python(target))
        temp.close()
        command_path = temp_py

    try:
        completed = subprocess.run(
            [sys.executable, str(command_path)],
            cwd=str(paths["code"]),
            capture_output=True,
            text=True,
            check=False,
            timeout=req.timeout_seconds,
        )
        status = "success" if completed.returncode == 0 else "failed"
        payload = {
            "slug": slug,
            "path": target.relative_to(paths["root"]).as_posix(),
            "status": status,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-12000:],
            "stderr": completed.stderr[-12000:],
            "duration_seconds": round(time.time() - started, 3),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    except subprocess.TimeoutExpired as exc:
        payload = {
            "slug": slug,
            "path": target.relative_to(paths["root"]).as_posix(),
            "status": "timeout",
            "returncode": None,
            "stdout": (exc.stdout or "")[-12000:] if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "")[-12000:] if isinstance(exc.stderr, str) else "Execution timed out",
            "duration_seconds": round(time.time() - started, 3),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    finally:
        if temp_py:
            try:
                temp_py.unlink(missing_ok=True)
            except OSError:
                pass

    run_path = paths["runs"] / f"{int(time.time())}_{target.stem}.json"
    write_metadata_file(run_path, payload)
    return {**payload, "run_log": run_path.relative_to(paths["root"]).as_posix(), **list_workspace_files(paths)}


@app.post("/api/transcribe")
async def transcribe(request: Request) -> Dict[str, Any]:
    """Transcribe uploaded audio using an optional local Whisper backend.

    Accepts raw audio bytes, or multipart form with `audio`/`file` when python-multipart is installed.
    """
    content_type = request.headers.get("content-type", "")
    language = request.query_params.get("language") or os.getenv("WHISPER_LANGUAGE", "id")
    model_name = request.query_params.get("model") or os.getenv("WHISPER_MODEL", "base")
    audio_bytes = b""
    suffix = ".webm"

    if "multipart/form-data" in content_type:
        try:
            form = await request.form()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not parse multipart form. Prefer raw audio upload or install python-multipart. {exc}") from exc
        upload = form.get("audio") or form.get("file")
        if not upload or not hasattr(upload, "read"):
            raise HTTPException(status_code=400, detail="Missing audio file field")
        suffix = Path(getattr(upload, "filename", "speech.webm")).suffix or ".webm"
        audio_bytes = await upload.read()
        language = str(form.get("language") or language)
        model_name = str(form.get("model") or model_name)
    else:
        audio_bytes = await request.body()
        if "wav" in content_type:
            suffix = ".wav"
        elif "mpeg" in content_type or "mp3" in content_type:
            suffix = ".mp3"

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Missing audio bytes")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(audio_bytes)

    try:
        if not ensure_ffmpeg_on_path():
            raise HTTPException(status_code=501, detail="FFmpeg is not available. Install FFmpeg so Whisper can decode browser audio.")
        try:
            from faster_whisper import WhisperModel  # type: ignore

            model = WhisperModel(
                model_name,
                device=os.getenv("WHISPER_DEVICE", "cpu"),
                compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            )
            segments, info = model.transcribe(str(tmp_path), language=language, vad_filter=True)
            text = " ".join(segment.text.strip() for segment in segments).strip()
            return {"text": text, "language": getattr(info, "language", language), "provider": "faster-whisper", "model": model_name}
        except ImportError:
            import whisper  # type: ignore

            model = whisper.load_model(model_name)
            result = model.transcribe(str(tmp_path), language=language)
            return {"text": str(result.get("text", "")).strip(), "language": language, "provider": "openai-whisper", "model": model_name}
    except ImportError as exc:
        raise HTTPException(
            status_code=501,
            detail="Whisper backend is not installed. Install faster-whisper or openai-whisper.",
        ) from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
