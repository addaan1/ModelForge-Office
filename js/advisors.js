import { AGENTS, WORKFLOW } from './config.js';

const localMemory = {
  decisions: [],
  experiments: [],
  meeting: []
};

export function getAgent(agentId) {
  return AGENTS.find(a => a.id === agentId) ?? AGENTS[0];
}

export function extractCompetitionSlug(link = '') {
  const trimmed = String(link || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/competitions\/([^/?#]+)/i);
  if (match) return match[1];
  return trimmed.replace(/^https?:\/\//, '').split(/[/?#]/)[0].split('/').filter(Boolean).pop() ?? trimmed;
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function storageGet(key, fallback = '') {
  if (typeof localStorage === 'undefined') return fallback;
  const value = localStorage.getItem(key);
  return value === null || value === '' ? fallback : value;
}

function storageJson(key, fallback) {
  return safeJsonParse(storageGet(key, JSON.stringify(fallback)), fallback);
}

export function defaultWhiteboard() {
  return `KAGGLE WAR ROOM - STRATEGY BOARD

1. Problem framing
- Competition slug/link:
- Metric:
- Target variable:
- Deadline:

2. Data audit
- File list:
- Train/test shape:
- Missing values:
- Leakage candidates:

3. Validation
- Split strategy:
- Why this split mimics private LB:

4. Experiment log
- Baseline:
- Feature batch 1:
- Model comparison:

5. Submission ritual
- File format checked:
- Reproducibility checked:
- Decision log updated:`;
}

export function defaultProjectState() {
  return {
    competitionLink: '',
    problemType: 'Belum dianalisis',
    briefText: '',
    whiteboard: defaultWhiteboard(),
    checklist: [],
    llmEndpoint: 'http://127.0.0.1:7860/api/chat',
    llmModelLabel: 'gemma3:4b',
    backendBaseUrl: 'http://127.0.0.1:7860',
    voiceEnabled: false,
    currentProject: { slug: '', downloadPath: '', updatedAt: '' },
    kaggleMetadata: {},
    downloadStatus: { status: 'idle', message: 'Belum dianalisis.' },
    workspaceState: { slug: '', paths: {}, code_files: [], outputs: [], runs: [], latest_run: null, activeFile: '' },
    missionRouter: { mode: 'fast', messages: [] },
    teamGathered: false,
    seatMode: { active: false, seatId: '', label: '' },
    transcriptDraft: '',
    experimentLog: [],
    audioSettings: {
      musicEnabled: false,
      ambienceEnabled: false,
      voiceEnabled: false,
      musicVolume: 0.55,
      ambienceVolume: 0.58,
      voiceVolume: 0.85
    },
    npcBehaviorEnabled: true,
    focusMode: false,
    collisionDebugEnabled: false,
    lookSensitivity: 0.96,
    currentFloor: 1,
    conversationState: { active: false, agentId: 'maya-pm', messages: [], lastPrompt: '' },
    meetingStageState: {
      active: false,
      topic: '',
      mode: 'strategy',
      statusByAgent: {},
      outputs: [],
      transcript: [],
      summary: '',
      summaryStatus: 'idle',
      savedDecisions: false
    },
    officeAliveState: {
      coffeeBrews: 0,
      notesRead: [],
      focusCornerUses: 0,
      lastDirectoryFloor: 1,
      strategyLight: 'idle'
    },
    learningProgress: {
      quizRuns: 0,
      bestScore: 0,
      reviewedConcepts: [],
      games: {
        quiz: { runs: 0, bestScore: 0 },
        leakHunter: { runs: 0, bestScore: 0 },
        typingSprint: { runs: 0, bestScore: 0 },
        memoryMatch: { runs: 0, bestScore: 0 }
      }
    }
  };
}

export function loadState() {
  const defaults = defaultProjectState();
  return {
    ...defaults,
    competitionLink: storageGet('kwo.competitionLink', defaults.competitionLink),
    problemType: storageGet('kwo.problemType', defaults.problemType),
    briefText: storageGet('kwo.briefText', defaults.briefText),
    whiteboard: storageGet('kwo.whiteboard', defaults.whiteboard),
    checklist: storageJson('kwo.checklist', defaults.checklist),
    llmEndpoint: storageGet('kwo.llmEndpoint', defaults.llmEndpoint),
    llmModelLabel: storageGet('kwo.llmModelLabel', defaults.llmModelLabel),
    backendBaseUrl: storageGet('kwo.backendBaseUrl', defaults.backendBaseUrl),
    voiceEnabled: storageGet('kwo.voiceEnabled', 'false') === 'true',
    currentProject: storageJson('kwo.currentProject', defaults.currentProject),
    kaggleMetadata: storageJson('kwo.kaggleMetadata', defaults.kaggleMetadata),
    downloadStatus: storageJson('kwo.downloadStatus', defaults.downloadStatus),
    workspaceState: { ...defaults.workspaceState, ...storageJson('kwo.workspaceState', defaults.workspaceState) },
    missionRouter: { ...defaults.missionRouter, ...storageJson('kwo.missionRouter', defaults.missionRouter) },
    teamGathered: storageGet('kwo.teamGathered', 'false') === 'true',
    seatMode: storageJson('kwo.seatMode', defaults.seatMode),
    transcriptDraft: storageGet('kwo.transcriptDraft', defaults.transcriptDraft),
    experimentLog: storageJson('kwo.experimentLog', defaults.experimentLog),
    audioSettings: { ...defaults.audioSettings, ...storageJson('kwo.audioSettings', defaults.audioSettings) },
    npcBehaviorEnabled: storageGet('kwo.npcBehaviorEnabled', 'true') !== 'false',
    focusMode: storageGet('kwo.focusMode', 'false') === 'true',
    collisionDebugEnabled: storageGet('kwo.collisionDebugEnabled', 'false') === 'true',
    lookSensitivity: Number(storageGet('kwo.lookSensitivity', defaults.lookSensitivity)) || defaults.lookSensitivity,
    currentFloor: Number(storageGet('kwo.currentFloor', defaults.currentFloor)) || defaults.currentFloor,
    conversationState: { ...defaults.conversationState, ...storageJson('kwo.conversationState', defaults.conversationState) },
    meetingStageState: { ...defaults.meetingStageState, ...storageJson('kwo.meetingStageState', defaults.meetingStageState) },
    officeAliveState: { ...defaults.officeAliveState, ...storageJson('kwo.officeAliveState', defaults.officeAliveState) },
    learningProgress: mergeLearningProgress(defaults.learningProgress, storageJson('kwo.learningProgress', defaults.learningProgress))
  };
}

function mergeLearningProgress(defaults, saved) {
  const merged = { ...defaults, ...(saved || {}) };
  merged.reviewedConcepts = Array.isArray(merged.reviewedConcepts) ? merged.reviewedConcepts : [];
  merged.games = {
    ...defaults.games,
    ...((saved && typeof saved.games === 'object') ? saved.games : {})
  };
  return merged;
}

export function saveStatePatch(patch) {
  if (typeof localStorage === 'undefined') return;
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'object') localStorage.setItem(`kwo.${key}`, JSON.stringify(value));
    else localStorage.setItem(`kwo.${key}`, String(value));
  }
}

export function applyAnalyzeResult(state, result) {
  const slug = result?.slug || extractCompetitionSlug(state.competitionLink || '');
  const profileFiles = Array.isArray(result?.data_profile?.files) ? result.data_profile.files : [];
  const resultFiles = Array.isArray(result?.files) && result.files.length ? result.files : profileFiles;
  return {
    ...state,
    currentProject: {
      slug,
      downloadPath: result?.download_path || '',
      updatedAt: new Date().toISOString()
    },
    kaggleMetadata: {
      slug,
      files: resultFiles,
      metadata: result?.metadata || {},
      data_profile: result?.data_profile || {},
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      needs_user_confirmation: Boolean(result?.needs_user_confirmation)
    },
    downloadStatus: {
      status: result?.download_path ? 'complete' : 'analyzed',
      message: result?.download_path
        ? `Data tersedia di ${result.download_path}`
        : 'Metadata tersedia, tetapi data belum terdownload.'
    }
  };
}

export function buildAdvisorContext(state, meetingOutputs = []) {
  const profileFiles = state.kaggleMetadata?.data_profile?.files || [];
  const files = (state.kaggleMetadata?.files || []).length ? state.kaggleMetadata.files : profileFiles;
  return {
    competitionLink: state.competitionLink,
    problemType: state.problemType,
    briefText: state.briefText,
    workflow: WORKFLOW,
    current_project: state.currentProject || {},
    kaggle_metadata: {
      slug: state.kaggleMetadata?.slug || state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || ''),
      files,
      metadata: state.kaggleMetadata?.metadata || {},
      data_profile: state.kaggleMetadata?.data_profile || {},
      warnings: state.kaggleMetadata?.warnings || []
    },
    data_profile: state.kaggleMetadata?.data_profile || {},
    workspace_files: state.workspaceState?.code_files || [],
    latest_run: state.workspaceState?.latest_run || {},
    notebook_summary: summarizeWorkspaceFiles(state.workspaceState?.code_files || [], '.ipynb'),
    code_summary: summarizeWorkspaceFiles(state.workspaceState?.code_files || [], '.py'),
    whiteboard: state.whiteboard || '',
    experiment_log: state.experimentLog || [],
    meeting_context: meetingOutputs.map(item => ({
      role: item.agent?.role || '',
      name: item.agent?.name || '',
      answer: item.answer || ''
    }))
  };
}

function summarizeWorkspaceFiles(files, suffix) {
  return (files || [])
    .filter(file => String(file.suffix || file.path || '').toLowerCase().includes(suffix))
    .slice(0, 4)
    .map(file => `${file.path || file.name}: ${String(file.preview || '').slice(0, 360)}`)
    .join('\n\n');
}

function briefSummary(state) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || '');
  const problem = state.problemType || 'Belum dianalisis';
  const brief = (state.briefText || '').trim();
  const profileFiles = state.kaggleMetadata?.data_profile?.files || [];
  const files = (state.kaggleMetadata?.files || []).length ? state.kaggleMetadata.files : profileFiles;
  const tables = state.kaggleMetadata?.data_profile?.tables || [];
  return [
    slug ? `Kompetisi: ${slug}` : 'Kompetisi belum diisi.',
    `Jenis problem: ${problem}.`,
    files.length ? `File Kaggle terdeteksi: ${files.map(f => f.name || f.ref || f.raw || 'file').slice(0, 6).join(', ')}.` : 'File Kaggle belum dianalisis.',
    tables.length ? `Profil data: ${tables.map(t => `${t.name} (${t.rows ?? '?'} rows)`).slice(0, 4).join(', ')}.` : 'Profil data lokal belum tersedia.',
    brief ? `Catatan user: ${brief}` : 'Catatan awal belum ada.'
  ].join('\n');
}

function pickRelevantWorkflow(text) {
  const t = text.toLowerCase();
  if (t.includes('valid') || t.includes('split') || t.includes('leak')) return ['validation', 'error', 'submit'];
  if (t.includes('eda') || t.includes('visual') || t.includes('insight')) return ['eda', 'features', 'error'];
  if (t.includes('model') || t.includes('baseline') || t.includes('xgboost') || t.includes('deep')) return ['baseline', 'modeling', 'ensemble'];
  if (t.includes('notebook') || t.includes('portofolio') || t.includes('story')) return ['baseline', 'submit', 'postmortem'];
  if (t.includes('data') || t.includes('download') || t.includes('file')) return ['download', 'eda', 'validation'];
  return ['intake', 'eda', 'validation', 'baseline'];
}

function workflowBullets(ids) {
  return ids.map(id => WORKFLOW.find(step => step.id === id)).filter(Boolean)
    .map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`)
    .join('\n');
}

function roleSpecificAdvice(agent, message, state) {
  const text = message.toLowerCase();
  const summary = briefSummary(state);
  if (agent.id === 'maya-pm') {
    return `Baik. Saya akan posisikan ini sebagai project sprint Kaggle, bukan sekadar coba-coba notebook.\n\n${summary}\n\nPrioritas kerja:\n${workflowBullets(['intake','download','eda','validation','baseline'])}\n\nKeputusan awal yang perlu dikunci: metric utama, batas submit harian, strategi validasi, dan format decision log. Setelah itu baru kita izinkan eksplorasi model yang lebih agresif.`;
  }
  if (agent.id === 'raka-data') {
    return `Dari sisi data engineering, jangan mulai modeling sebelum katalog data selesai.\n\n${summary}\n\nChecklist saya:\n- Identifikasi file train/test/sample_submission dan relasi antar tabel.\n- Buat data dictionary otomatis: nama kolom, tipe, missing ratio, cardinality, contoh nilai.\n- Cari kolom yang hanya muncul di train atau terlalu dekat dengan target. Itu kandidat leakage.\n- Simpan pipeline preprocessing dalam fungsi agar eksperimen tidak berubah diam-diam.`;
  }
  if (agent.id === 'sinta-eda') {
    return `EDA yang bagus harus menjawab pertanyaan, bukan hanya membuat plot.\n\n${summary}\n\nHipotesis awal:\n- Apakah target imbalance?\n- Apakah ada grup waktu/lokasi/user yang membuat split random menjadi berbahaya?\n- Fitur mana yang paling stabil di train-test?\n- Outlier mana yang harus dipertahankan karena justru sinyal kompetisi?\n\nOutput EDA minimal: 5 insight yang bisa diuji melalui fitur atau validasi.`;
  }
  if (agent.id === 'bima-ml') {
    return `Saya sarankan baseline bertahap. Jangan langsung ensemble besar.\n\n${summary}\n\nRute model:\n1. Dummy/mean baseline untuk sanity check metric.\n2. Model cepat: Logistic/Ridge atau LightGBM/CatBoost sesuai data.\n3. Validasi fold konsisten dengan seed tetap.\n4. Feature batch kecil; setiap batch harus punya alasan.\n5. Ensemble hanya jika model punya error pattern yang berbeda.\n\nKalau pertanyaannya tentang model spesifik, kirim metric dan bentuk datanya agar saya bisa pilih family model lebih tajam.`;
  }
  if (agent.id === 'nadia-val') {
    return `Saya akan kritis: public leaderboard bukan validasi.\n\n${summary}\n\nDesain validasi awal:\n${workflowBullets(['validation','error','submit'])}\n\nCari kemungkinan:\n- time leakage, group leakage, duplicated rows, target encoding bocor;\n- distribusi test berbeda dari train;\n- metric yang sensitif terhadap threshold/calibration.\n\nSebelum submit, bandingkan CV mean, CV variance, dan LB score. Jika tidak searah, audit split dulu.`;
  }
  if (agent.id === 'tari-story') {
    return `Notebook kompetisi harus bisa dibaca seperti laporan riset mini.\n\n${summary}\n\nStruktur notebook yang saya sarankan:\n1. Problem framing dan metric.\n2. Data audit singkat.\n3. EDA insight, bukan galeri plot.\n4. Validation design.\n5. Baseline dan eksperimen.\n6. Error analysis.\n7. Final submission dan limitation.\n\nTujuannya: reader paham kenapa keputusan dibuat, bukan hanya melihat score.`;
  }
  if (agent.id === 'dimas-review') {
    return `Saya akan review dengan asumsi ada bug sampai terbukti tidak ada.\n\n${summary}\n\nAudit cepat:\n- Apakah preprocessing fit hanya pada train/fold train?\n- Apakah target encoding dilakukan per fold?\n- Apakah sample_submission benar urutan ID-nya?\n- Apakah seed, versi library, dan data path tercatat?\n- Apakah leaderboard naik karena validasi membaik, atau hanya lucky submit?\n\nKirim notebook/hasil eksperimen nanti, saya akan serang bagian yang paling rawan.`;
  }
  if (agent.id === 'lana-mentor') {
    const specific = text.includes('nggak paham') || text.includes('tidak paham') || text.includes('jelaskan') ? 'Kita mulai dari konsep yang paling dasar, lalu naik ke contoh Kaggle.' : 'Saya akan bantu jadikan alur ini sebagai materi belajar.';
    return `${specific}\n\n${summary}\n\nCara belajar yang saya sarankan:\n- Setelah setiap eksperimen, tulis "mengapa" sebelum melihat score.\n- Minta satu advisor menjelaskan konsep, lalu satu advisor lain mengkritik.\n- Jangan hanya copy notebook; tulis ulang pipeline minimal dari nol.\n- Buat flashcard: metric, leakage, CV, baseline, feature importance, dan calibration.\n\nKalau ada konsep spesifik, tanyakan langsung; saya jawab dengan analogi dan contoh kode kecil.`;
  }
  return `Saya menangkap pertanyaan Anda. Berdasarkan brief saat ini:\n${summary}\n\nLangkah yang relevan:\n${workflowBullets(pickRelevantWorkflow(message))}`;
}

export function buildPlanFromState(state) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink);
  const profileFiles = state.kaggleMetadata?.data_profile?.files || [];
  const files = (state.kaggleMetadata?.files || []).length ? state.kaggleMetadata.files : profileFiles;
  const fileNames = files.map(file => file.name || file.ref || file.raw).filter(Boolean);
  const profileTables = state.kaggleMetadata?.data_profile?.tables || [];
  const rows = [
    `Project: ${slug || 'Kaggle competition belum diisi'}`,
    `Problem type: ${state.problemType || 'Belum dianalisis'}`,
    fileNames.length ? `Detected files: ${fileNames.slice(0, 8).join(', ')}` : 'Detected files: belum ada metadata Kaggle',
    profileTables.length ? `Local data profile: ${profileTables.map(t => `${t.name}=${t.rows ?? '?'} rows`).join(', ')}` : 'Local data profile: belum tersedia',
    '',
    'Sprint 0 - Intake dan Rules',
    '- Baca overview, rules, evaluation metric, deadline, dan submission format.',
    '- Catat risiko diskualifikasi, external data policy, dan batas submission.',
    '',
    'Sprint 1 - Data Audit',
    '- Download data, buat data dictionary, cek shape, missing value, duplicate, cardinality.',
    '- Identifikasi train-test drift dan kandidat leakage.',
    '',
    'Sprint 2 - Validasi',
    '- Tentukan split: random, stratified, group, time-based, atau custom sesuai kompetisi.',
    '- Simpan fold agar semua advisor berbicara dengan dasar yang sama.',
    '',
    'Sprint 3 - Baseline dan EDA',
    '- Buat baseline reproducible.',
    '- EDA diarahkan untuk menjawab hipotesis, bukan hanya visualisasi.',
    '',
    'Sprint 4 - Eksperimen Model',
    '- Feature batch kecil, model comparison, error analysis, dan ensemble selektif.',
    '',
    'Sprint 5 - Submission dan Review',
    '- Audit notebook, sample submission, seed, versi data, dan decision log.',
    '- Rapat multi-agent sebelum submit final.'
  ];
  return rows.join('\n');
}

export function onboardingSteps(state) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || '');
  return [
    slug ? `Project aktif: ${slug}. Pastikan rules dan metric sudah terbaca.` : 'Isi link/slug kompetisi lalu jalankan Analisis & Download Kaggle.',
    'Mission: cek file list, sample submission, metric, rules, dan batas submission.',
    'Data Lab: Raka membuat data audit, Sinta membuat EDA berbasis hipotesis.',
    'Model Lab: Nadia mengunci strategi validasi sebelum Bima memulai baseline.',
    'Glass War Room: kumpulkan advisor untuk debat strategi dan simpan keputusan.',
    'Board: update whiteboard, checklist, dan experiment log setelah setiap eksperimen.',
    'Lantai 2: review kritis, learning studio, dan post-mortem.'
  ];
}

export async function askAdvisor(agentId, message, state) {
  const agent = getAgent(agentId);
  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  const endpoint = (state.llmEndpoint || `${base}/api/chat`).trim();
  const endpoints = [
    endpoint,
    `${base}/api/chat`,
    'http://127.0.0.1:7860/api/chat',
    'http://localhost:7860/api/chat'
  ].filter(Boolean);
  const uniqueEndpoints = [...new Set(endpoints.flatMap(url => [url.replace('localhost', '127.0.0.1'), url]))];
  if (uniqueEndpoints.length) {
    try {
      const payload = {
        model: normalizeBackendModelId(state.llmModelLabel),
        agent: { id: agent.id, name: agent.name, role: agent.role, system: agent.system },
        message,
        context: buildAdvisorContext(state)
      };
      for (const url of uniqueEndpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const answer = data.answer || data.message || data.content;
          if (answer) {
            const provider = data.provider || 'unknown';
            const model = data.model || state.llmModelLabel || 'unknown';
            const providerLine = provider === 'local-rule'
              ? `[Backend fallback: ${provider}. Backend terpanggil, tapi Ollama/model belum berhasil dipakai.]`
              : `[LLM: ${provider} / ${model}]`;
            return `${providerLine}\n\n${String(answer)}`;
          }
        } catch (err) {
          console.warn(`LLM endpoint failed (${url}), trying fallback.`, err);
        }
      }
    } catch (err) {
      console.warn('LLM endpoint failed, using local advisor.', err);
    }
  }
  return `[Frontend fallback: rule-based. Backend /api/chat belum terpanggil.]\n\n${roleSpecificAdvice(agent, message, state)}`;
}

export function normalizeBackendModelId(label) {
  const raw = String(label || '').trim();
  if (!raw) return 'gemma3:4b';
  const compact = raw.toLowerCase().replace(/\s+/g, ' ');
  if (compact.includes('gemma') && compact.includes('3') && compact.includes('4b')) return 'gemma3:4b';
  if (compact.includes('llama') && compact.includes('3.1') && compact.includes('8b')) return 'llama3.1:8b';
  if (compact.includes('qwen') && compact.includes('coder')) return 'qwen2.5-coder:7b';
  if (/^[A-Za-z0-9._:/-]+$/.test(raw)) return raw;
  return 'gemma3:4b';
}

export async function multiAgentDebate(topic, state, agents = AGENTS) {
  const order = ['maya-pm','raka-data','sinta-eda','nadia-val','bima-ml','tari-story','dimas-review','lana-mentor'];
  const normalized = topic?.trim() || 'Susun strategi awal kompetisi Kaggle dari brief yang tersedia.';
  const selected = order.map(getAgent).filter(Boolean);
  const outputs = [];
  for (const agent of selected) {
    const prompt = `Topik rapat: ${normalized}\n\nBerikan pendapat sebagai ${agent.role}. Jangan panjang, fokus pada keputusan atau risiko penting.`;
    const answer = await askAdvisor(agent.id, prompt, state);
    outputs.push({ agent, answer });
    localMemory.meeting.push({ agentId: agent.id, topic: normalized, answer, ts: Date.now() });
  }
  return outputs;
}

export const MEETING_SUMMARY_SECTION_TITLES = [
  'Executive Summary',
  'Key Decisions',
  'Most Valuable Insights',
  'Risks & Objections',
  'Next Experiments',
  'Open Questions',
  'Recommended Next Meeting'
];

export function summarizeMeetingFallback(outputs = [], topic = '', mode = 'strategy') {
  const usable = outputs.filter(item => item && !item.failed);
  const failed = outputs.filter(item => item?.failed);
  const sourceList = usable.map(item => `${item.agent?.name || 'Advisor'} (${item.agent?.role || 'Role unknown'})`);
  const insights = usable.map(item => {
    const source = `${item.agent?.name || 'Advisor'}${item.agent?.role ? ` - ${item.agent.role}` : ''}`;
    return `- ${source}: ${extractMeetingInsight(item.answer)}`;
  });
  const hasData = usable.length > 0;
  const modeLabel = formatMeetingMode(mode);
  return [
    '## Executive Summary',
    hasData
      ? `Rapat ${modeLabel} membahas ${topic || 'strategi Kaggle aktif'} dengan ${usable.length} advisor. Fokus keputusan: validasi yang bisa dipercaya, audit data, eksperimen kecil yang tercatat, dan submission yang aman.`
      : 'Belum ada output advisor yang berhasil, jadi summary ini hanya fallback lokal. Jalankan meeting ulang setelah backend/LLM siap.',
    '',
    '## Key Decisions',
    '- Gunakan alur: intake brief -> audit data -> validasi -> baseline reproducible -> eksperimen terarah -> review sebelum submit.',
    '- Semua eksperimen harus punya hipotesis, metric, seed, dan keputusan lanjut.',
    '- Jangan mengandalkan public leaderboard tanpa validasi internal yang masuk akal.',
    '',
    '## Most Valuable Insights',
    insights.length ? insights.join('\n') : '- Belum ada insight advisor yang bisa diekstrak.',
    '',
    '## Risks & Objections',
    '- Leakage, split validasi yang tidak meniru private leaderboard, dan format submission tetap menjadi risiko utama.',
    '- Jika satu advisor gagal, rapat tetap sah tetapi bagian tersebut perlu diulang atau direview manual.',
    failed.length ? `- Advisor gagal: ${failed.map(item => item.agent?.name || 'unknown').join(', ')}.` : '- Tidak ada kegagalan advisor yang tercatat.',
    '',
    '## Next Experiments',
    '- Buat baseline cepat dan reproducible, lalu simpan CV score dan catatan keputusan.',
    '- Jalankan EDA terarah untuk missing value, distribusi target, outlier, dan kandidat leakage.',
    '- Bandingkan satu perubahan kecil per run agar efeknya mudah dibaca.',
    '',
    '## Open Questions',
    '- Metric resmi dan aturan submission sudah dikunci atau belum?',
    '- Apakah split validasi sudah meniru distribusi test/private leaderboard?',
    '- Kolom mana yang paling berisiko leakage atau drift?',
    '',
    '## Recommended Next Meeting',
    sourceList.length
      ? `Lanjutkan dengan Data/EDA Review bersama ${sourceList.slice(0, 3).join(', ')} setelah profil data dan baseline pertama tersedia.`
      : 'Ulangi Strategy Planning setelah backend/LLM aktif atau advisor berhasil menjawab.'
  ].join('\n');
}

export function summarizeMeeting(outputs = [], topic = '', mode = 'strategy') {
  return summarizeMeetingFallback(outputs, topic, mode);
}

function extractMeetingInsight(answer = '') {
  const lines = String(answer || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^\[(LLM|Backend fallback|Frontend fallback):/i.test(line))
    .filter(line => !/^#{1,3}\s/.test(line))
    .filter(line => !/^\*\*.+\*\*:?.*$/.test(line));
  const candidate = lines.find(line => line.length > 24) || lines[0] || 'Tidak ada detail yang cukup spesifik.';
  return candidate.length > 190 ? `${candidate.slice(0, 187)}...` : candidate;
}

function formatMeetingMode(mode = 'strategy') {
  return ({
    strategy: 'Strategy Planning',
    data: 'Data/EDA Review',
    validation: 'Validation & Leakage Audit',
    experiment: 'Experiment Review',
    submission: 'Submission Gate'
  })[mode] || 'Strategy Planning';
}

export function buildKanbanItems(state) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink) || 'project';
  const profileFiles = state.kaggleMetadata?.data_profile?.files || [];
  const files = (state.kaggleMetadata?.files || []).length ? state.kaggleMetadata.files : profileFiles;
  const profile = state.kaggleMetadata?.data_profile?.tables || [];
  const sampleSubmission = files.find(file => String(file.name || '').toLowerCase().includes('sample'));
  const firstDataFile = files.find(file => String(file.name || '').toLowerCase().endsWith('.csv')) || files[0];
  return {
    Todo: [
      `Read rules & metric for ${slug}`,
      firstDataFile ? `Create data dictionary from ${firstDataFile.name || firstDataFile.ref}` : 'Create data dictionary',
      'Design validation split'
    ],
    Doing: [
      profile.length ? `EDA hypotheses from ${profile[0].name}` : 'EDA hypotheses',
      'Baseline notebook skeleton'
    ],
    Review: [
      'Leakage audit',
      sampleSubmission ? `Submission format check: ${sampleSubmission.name}` : 'Submission format check'
    ]
  };
}

