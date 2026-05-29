import { OfficeWorld } from './world.js?v=2.7';
import { OfficeAudioManager } from './audio.js?v=2.7';
import { AGENTS, ROOMS } from './config.js?v=2.7';
import {
  getAgent,
  askAdvisor,
  summarizeMeetingFallback,
  loadState,
  saveStatePatch,
  buildPlanFromState,
  onboardingSteps,
  buildKanbanItems,
  applyAnalyzeResult,
  extractCompetitionSlug,
  normalizeBackendModelId
} from './advisors.js?v=2.7';

const $ = (sel) => document.querySelector(sel);
const state = loadState();
// v2.7 migrate default look sensitivity upward, while preserving deliberate custom values.
if (state.lookSensitivity == null || Math.abs(Number(state.lookSensitivity) - 0.78) < 0.001) {
  state.lookSensitivity = 0.96;
  saveStatePatch({ lookSensitivity: state.lookSensitivity });
}
let activeAgentId = AGENTS[0].id;
let lastMeetingOutputs = [];
let lastMeetingTranscript = [];
let activeFloor = 1;
let activeRoom = 'Lobby & Onboarding';
let mediaRecorder = null;
let audioChunks = [];
let activeStream = null;
let activeConversationAgentId = activeAgentId;
let lastConversationAnswer = '';
let activeGameId = 'quiz';
let gameState = {};
let currentDebateTopic = '';

const audioManager = new OfficeAudioManager(state.audioSettings || {});

const GAME_DEFS = [
  { id: 'quiz', title: 'Kaggle Quiz', subtitle: 'Metric, leakage, validation, EDA, dan submission.' },
  { id: 'leakHunter', title: 'Leak Hunter', subtitle: 'Cari fitur yang berisiko bocor dari skenario singkat.' },
  { id: 'typingSprint', title: 'Typing Sprint', subtitle: 'Latihan command dan konsep Kaggle dengan tempo cepat.' },
  { id: 'memoryMatch', title: 'Memory Match', subtitle: 'Cocokkan istilah ML dengan artinya.' }
];

const QUIZ_QUESTIONS = [
  ['Apa risiko terbesar jika split validasi tidak meniru private leaderboard?', ['CV terlihat bagus tapi submission gagal generalisasi', 'Training menjadi lebih cepat', 'File submission otomatis benar'], 0, 'Validation split', 'Validasi harus meniru distribusi test/private leaderboard.'],
  ['Apa tanda awal data leakage dalam kompetisi tabular?', ['Fitur punya korelasi tidak wajar dengan target', 'Kolom numeric terlalu banyak', 'Dataset punya sample_submission'], 0, 'Leakage', 'Korelasi terlalu sempurna sering berarti fitur membawa informasi masa depan/target.'],
  ['Kenapa sample_submission perlu dicek sebelum submit?', ['Untuk memastikan format kolom dan urutan id benar', 'Untuk menaikkan learning rate', 'Untuk menghapus missing value'], 0, 'Submission format', 'Banyak submission gagal karena format, bukan model.'],
  ['Kapan ensembling masuk akal dilakukan?', ['Setelah baseline dan validasi stabil menunjukkan variasi model saling melengkapi', 'Sebelum tahu metric', 'Sebelum EDA'], 0, 'Ensembling', 'Ensemble sebaiknya datang setelah validasi kuat dan error pattern berbeda.'],
  ['Apa tujuan baseline pertama?', ['Membuat pembanding sederhana yang reproducible', 'Langsung menang leaderboard', 'Menghapus semua fitur kategorikal'], 0, 'Baseline', 'Baseline memberi sanity check sebelum eksperimen mahal.'],
  ['Metric RMSE paling sensitif terhadap apa?', ['Error besar/outlier', 'Urutan baris submission', 'Jumlah fold selalu genap'], 0, 'Metric', 'RMSE menghukum error besar lebih keras dari MAE.'],
  ['Apa tanda train-test drift yang perlu dicurigai?', ['Distribusi fitur penting berbeda jauh antara train dan test', 'Nama file test.csv ada', 'Jumlah kolom train sama dengan test'], 0, 'Drift', 'Drift membuat CV random bisa terlalu optimistis.'],
  ['Target encoding yang aman dilakukan bagaimana?', ['Dihitung per fold tanpa melihat validation fold', 'Dihitung dari seluruh train sebelum CV', 'Dihitung dari test.csv'], 0, 'Target encoding', 'Target encoding global bisa bocor ke fold validasi.'],
  ['Apa alasan menyimpan fold split?', ['Agar semua eksperimen dibandingkan pada validasi yang sama', 'Agar notebook lebih pendek', 'Agar submission lebih kecil'], 0, 'Reproducibility', 'Fold tetap membuat perbandingan eksperimen adil.'],
  ['Apa yang harus diaudit sebelum submit final?', ['Seed, preprocessing per fold, format submission, dan decision log', 'Warna plot EDA', 'Nama variabel harus pendek'], 0, 'Submission ritual', 'Ritual submit mengurangi bug kecil yang mahal.'],
  ['Apa arti public leaderboard shake-up?', ['Public score tidak selalu merepresentasikan private score', 'Model pasti salah', 'Data test berubah setelah submit'], 0, 'Leaderboard', 'Public LB biasanya hanya subset test.'],
  ['Kapan stratified split dipakai pada regression?', ['Saat target dibinning agar distribusi target per fold mirip', 'Saat tidak ada target', 'Saat semua fitur string'], 0, 'Validation', 'Binning target bisa menjaga distribusi target di setiap fold.'],
  ['Apa output EDA yang berguna?', ['Insight yang bisa diuji sebagai fitur, split, atau audit risiko', 'Semua plot library default', 'Hanya heatmap korelasi'], 0, 'EDA', 'EDA harus menghasilkan keputusan, bukan galeri plot.'],
  ['Apa risiko memakai public notebooks tanpa paham?', ['Tidak tahu asumsi, leakage, dan validasi yang dipakai', 'Kode jadi terlalu pendek', 'File data hilang'], 0, 'Learning', 'Platform ini dibuat agar user paham alur, bukan sekadar copy.'],
  ['Apa yang harus dilakukan jika CV membaik tapi LB turun?', ['Audit split, leakage, distribusi test, dan submission format', 'Langsung ensemble lebih banyak', 'Hapus validation set'], 0, 'Error analysis', 'Ketidaksesuaian CV/LB adalah sinyal audit.'],
  ['Apa indikator eksperimen yang baik?', ['Hipotesis jelas, perubahan kecil, metric tercatat, dan keputusan disimpan', 'Mengubah banyak hal sekaligus', 'Hanya mengejar public LB'], 0, 'Experiment log', 'Eksperimen yang rapi membuat learning compounding.']
].map(([question, options, answer, concept, explanation]) => ({ question, options, answer, concept, explanation }));

const LEAK_HUNTER_SCENARIOS = [
  { prompt: 'Prediksi apakah pelanggan churn bulan depan.', columns: ['customer_id', 'last_month_spend', 'cancelled_at', 'support_ticket_count'], answer: 2, concept: 'Future leakage', explanation: '`cancelled_at` jelas terjadi setelah outcome dan bisa membocorkan target.' },
  { prompt: 'Prediksi harga rumah dari data listing.', columns: ['lot_area', 'neighborhood', 'sale_price_after_discount', 'year_built'], answer: 2, concept: 'Target proxy', explanation: 'Harga setelah diskon terlalu dekat dengan target final.' },
  { prompt: 'Prediksi pemenang pertandingan sebelum match dimulai.', columns: ['team_rating_before_match', 'final_score', 'home_team', 'weather_forecast'], answer: 1, concept: 'Post-event feature', explanation: '`final_score` hanya tersedia setelah pertandingan selesai.' },
  { prompt: 'Prediksi default pinjaman saat aplikasi diajukan.', columns: ['income', 'loan_amount', 'days_past_due_after_90d', 'employment_years'], answer: 2, concept: 'Time leakage', explanation: 'Keterlambatan 90 hari setelah approval tidak boleh dipakai saat prediksi awal.' },
  { prompt: 'Prediksi durasi pengiriman saat order dibuat.', columns: ['warehouse_id', 'courier_id', 'delivered_timestamp', 'distance_km'], answer: 2, concept: 'Future timestamp', explanation: 'Waktu barang sampai baru diketahui setelah proses selesai.' },
  { prompt: 'Prediksi nilai ujian final dari data awal semester.', columns: ['attendance_week_2', 'homework_avg_week_3', 'final_grade_released', 'previous_gpa'], answer: 2, concept: 'Label leakage', explanation: 'Kolom final grade adalah target/hasil akhir dalam bentuk lain.' }
];

const TYPING_PROMPTS = [
  'kaggle competitions download -c playground-series-s6e5',
  'python -m pip install kaggle',
  'train_test_split stratify target bins',
  'cross validation before leaderboard',
  'check sample submission columns',
  'fit preprocessing inside each fold',
  'save experiment metric and seed',
  'audit leakage before final submit'
];

const MEMORY_PAIRS = [
  ['RMSE', 'Menghukum error besar'],
  ['Leakage', 'Informasi target bocor'],
  ['OOF', 'Prediksi out of fold'],
  ['CV', 'Validasi silang'],
  ['EDA', 'Eksplorasi data'],
  ['Baseline', 'Model pembanding awal'],
  ['Drift', 'Distribusi berubah'],
  ['Seed', 'Kontrol reproducibility']
];

const CONVERSATION_PROMPTS = {
  project: 'Jelaskan project Kaggle aktif secara jelas: tujuan kompetisi, data yang sudah terdeteksi, metric/problem yang diketahui, risiko utama, dan langkah berikutnya.',
  risk: 'Audit risiko project ini: leakage, validation split, data quality, submission format, dan risiko overfit. Beri prioritas yang harus dicek dulu.',
  experiment: 'Berikan next experiment yang konkret dan murah diuji. Sertakan hipotesis, langkah, metric yang dicatat, dan keputusan lanjut jika hasilnya bagus/buruk.',
  teach: 'Ajari saya satu konsep Kaggle yang paling relevan dengan project ini secara sederhana, pakai analogi dan contoh praktis.'
};

const DEBATE_AGENT_ORDER = ['maya-pm', 'raka-data', 'sinta-eda', 'nadia-val', 'bima-ml', 'tari-story', 'dimas-review', 'lana-mentor'];
const MEETING_MODES = {
  strategy: {
    label: 'Strategy Planning',
    focus: 'prioritas sprint, keputusan awal, ownership, dan urutan kerja',
    advisorInstruction: 'Tekankan keputusan strategis, trade-off, dan urutan sprint yang paling masuk akal.'
  },
  data: {
    label: 'Data/EDA Review',
    focus: 'file, schema, missing value, distribusi target, drift, dan EDA yang menghasilkan keputusan',
    advisorInstruction: 'Fokus pada audit data, profil CSV, risiko kualitas data, dan insight EDA yang bisa diuji.'
  },
  validation: {
    label: 'Validation & Leakage Audit',
    focus: 'split validasi, leakage, public/private leaderboard gap, dan audit preprocessing per fold',
    advisorInstruction: 'Fokus pada cara membuktikan validasi aman dan menemukan leakage sebelum modeling agresif.'
  },
  experiment: {
    label: 'Experiment Review',
    focus: 'hasil run, hipotesis, metric, error analysis, dan next experiment yang murah diuji',
    advisorInstruction: 'Fokus pada interpretasi hasil eksperimen dan keputusan lanjut yang konkret.'
  },
  submission: {
    label: 'Submission Gate',
    focus: 'format submission, reproducibility, seed, final checks, dan risiko sebelum submit',
    advisorInstruction: 'Fokus pada checklist gate sebelum submit dan alasan go/no-go.'
  }
};
const ROUTER_RULES = [
  { match: ['data', 'schema', 'csv', 'kolom', 'missing', 'profile', 'eda'], agents: ['raka-data', 'sinta-eda'] },
  { match: ['baseline', 'model', 'training', 'fitur', 'xgboost', 'catboost', 'lightgbm'], agents: ['bima-ml', 'nadia-val'] },
  { match: ['notebook', 'code', 'kode', 'review', 'bug', 'script', 'ipynb'], agents: ['dimas-review', 'tari-story'] },
  { match: ['konsep', 'ajar', 'belajar', 'kenapa', 'explain'], agents: ['lana-mentor'] },
  { match: ['prioritas', 'sprint', 'deadline', 'rencana', 'alur'], agents: ['maya-pm'] }
];

const dom = {
  canvas: $('#worldCanvas'),
  sidePanel: $('#sidePanel'),
  togglePanelBtn: $('#togglePanelBtn'),
  panelEdgeTab: $('#panelEdgeTab'),
  panelTabs: [...document.querySelectorAll('[data-panel-tab]')],
  panelPanes: [...document.querySelectorAll('[data-panel-pane]')],
  enterWorldBtn: $('#enterWorldBtn'),
  cursorModeBtn: $('#cursorModeBtn'),
  gatherTeamBtn: $('#gatherTeamBtn'),
  goWarRoomBtn: $('#goWarRoomBtn'),
  goFloor2Btn: $('#goFloor2Btn'),
  voiceToggleBtn: $('#voiceToggleBtn'),
  focusModeBtn: $('#focusModeBtn'),
  musicToggle: $('#musicToggle'),
  ambienceToggle: $('#ambienceToggle'),
  musicVolume: $('#musicVolume'),
  ambienceVolume: $('#ambienceVolume'),
  voiceVolume: $('#voiceVolume'),
  npcBehaviorToggle: $('#npcBehaviorToggle'),
  collisionDebugToggle: $('#collisionDebugToggle'),
  lookSensitivity: $('#lookSensitivity'),
  npcStatus: $('#npcStatus'),
  floorPill: $('#floorPill'),
  modePill: $('#modePill'),
  voicePill: $('#voicePill'),
  miniMap: $('#miniMap'),
  interactionHint: $('#interactionHint'),
  rpgDialog: $('#rpgDialog'),
  rpgName: $('#rpgName'),
  rpgText: $('#rpgText'),
  rpgChoices: $('#rpgChoices'),
  rpgCloseBtn: $('#rpgCloseBtn'),
  officeInteractionOverlay: $('#officeInteractionOverlay'),
  officeInteractionKicker: $('#officeInteractionKicker'),
  officeInteractionTitle: $('#officeInteractionTitle'),
  officeInteractionBody: $('#officeInteractionBody'),
  officeInteractionStats: $('#officeInteractionStats'),
  officeInteractionActions: $('#officeInteractionActions'),
  officeInteractionCloseBtn: $('#officeInteractionCloseBtn'),
  competitionLink: $('#competitionLink'),
  problemType: $('#problemType'),
  briefText: $('#briefText'),
  saveBriefBtn: $('#saveBriefBtn'),
  buildPlanBtn: $('#buildPlanBtn'),
  kaggleAnalyzeBtn: $('#kaggleAnalyzeBtn'),
  currentProjectSummary: $('#currentProjectSummary'),
  missionStatus: $('#missionStatus'),
  metadataSummary: $('#metadataSummary'),
  agentSelect: $('#agentSelect'),
  activeAgentBox: $('#activeAgentBox'),
  routerMode: $('#routerMode'),
  routerInput: $('#routerInput'),
  routerAskBtn: $('#routerAskBtn'),
  routerLog: $('#routerLog'),
  openConversationBtn: $('#openConversationBtn'),
  chatLog: $('#chatLog'),
  chatInput: $('#chatInput'),
  sendChatBtn: $('#sendChatBtn'),
  recordTranscriptBtn: $('#recordTranscriptBtn'),
  stopTranscriptBtn: $('#stopTranscriptBtn'),
  transcriptStatus: $('#transcriptStatus'),
  meetingTopic: $('#meetingTopic'),
  meetingModeSelect: $('#meetingModeSelect'),
  startMeetingBtn: $('#startMeetingBtn'),
  summarizeMeetingBtn: $('#summarizeMeetingBtn'),
  meetingLog: $('#meetingLog'),
  workflowChecklist: $('#workflowChecklist'),
  experimentName: $('#experimentName'),
  experimentScore: $('#experimentScore'),
  addExperimentBtn: $('#addExperimentBtn'),
  experimentLog: $('#experimentLog'),
  openWhiteboardBtn: $('#openWhiteboardBtn'),
  whiteboardDialog: $('#whiteboardDialog'),
  whiteboardText: $('#whiteboardText'),
  saveWhiteboardBtn: $('#saveWhiteboardBtn'),
  generateWhiteboardBtn: $('#generateWhiteboardBtn'),
  kanbanBoard: $('#kanbanBoard'),
  onboardingDialog: $('#onboardingDialog'),
  onboardingSteps: $('#onboardingSteps'),
  workspaceScanBtn: $('#workspaceScanBtn'),
  workspaceReviewBtn: $('#workspaceReviewBtn'),
  workspaceStatus: $('#workspaceStatus'),
  workspaceFiles: $('#workspaceFiles'),
  workspacePreview: $('#workspacePreview'),
  workspaceTimeout: $('#workspaceTimeout'),
  workspaceRunBtn: $('#workspaceRunBtn'),
  workspaceRunLog: $('#workspaceRunLog'),
  templateButtons: [...document.querySelectorAll('[data-template]')],
  conversationOverlay: $('#conversationOverlay'),
  conversationKicker: $('#conversationKicker'),
  conversationTitle: $('#conversationTitle'),
  conversationSubtitle: $('#conversationSubtitle'),
  conversationSendBoardBtn: $('#conversationSendBoardBtn'),
  conversationCloseBtn: $('#conversationCloseBtn'),
  conversationMessages: $('#conversationMessages'),
  conversationInput: $('#conversationInput'),
  conversationSendBtn: $('#conversationSendBtn'),
  conversationQuickActions: [...document.querySelectorAll('[data-conv-prompt]')],
  debateStageOverlay: $('#debateStageOverlay'),
  debateStageTopic: $('#debateStageTopic'),
  debateSaveBtn: $('#debateSaveBtn'),
  debateRetryBtn: $('#debateRetryBtn'),
  debateCloseBtn: $('#debateCloseBtn'),
  debateAdvisorRail: $('#debateAdvisorRail'),
  debateTranscript: $('#debateTranscript'),
  debateSummaryStatus: $('#debateSummaryStatus'),
  debateStageSummary: $('#debateStageSummary'),
  saveTranscriptBtn: $('#saveTranscriptBtn'),
  sendDecisionsToBoardBtn: $('#sendDecisionsToBoardBtn'),
  arcadeOverlay: $('#arcadeOverlay'),
  arcadeTitle: $('#arcadeTitle'),
  arcadeSubtitle: $('#arcadeSubtitle'),
  arcadeCloseBtn: $('#arcadeCloseBtn'),
  arcadeGameTabs: $('#arcadeGameTabs'),
  arcadeContent: $('#arcadeContent'),
  workstationDock: $('#workstationDock'),
  workstationTitle: $('#workstationTitle'),
  workstationOutput: $('#workstationOutput'),
  workstationStandBtn: $('#workstationStandBtn'),
  workstationMissionBtn: $('#workstationMissionBtn'),
  workstationAdvisorBtn: $('#workstationAdvisorBtn'),
  workstationExperimentBtn: $('#workstationExperimentBtn'),
  workstationBoardBtn: $('#workstationBoardBtn'),
  workstationFocusBtn: $('#workstationFocusBtn'),
  applyOnboardingBtn: $('#applyOnboardingBtn'),
  openDocsBtn: $('#openDocsBtn'),
  backendBaseUrl: $('#backendBaseUrl'),
  llmEndpoint: $('#llmEndpoint'),
  llmModelLabel: $('#llmModelLabel'),
  saveLlmBtn: $('#saveLlmBtn'),
  toast: $('#toast')
};

const world = new OfficeWorld(dom.canvas, {
  onInteract: handleInteraction,
  onHint: (text) => dom.interactionHint.textContent = text,
  onLockChange: (locked) => updateMode(locked),
  onTogglePanel: () => togglePanel(),
  onFloorChange: (floor, room) => {
    activeFloor = floor;
    activeRoom = room;
    state.currentFloor = floor;
    saveStatePatch({ currentFloor: floor });
    dom.floorPill.textContent = `Floor ${floor} - ${room}`;
    renderMinimap();
  },
  onSeatChange: (seat) => {
    state.seatMode = seat || { active: false, seatId: '', label: '' };
    saveStatePatch({ seatMode: state.seatMode });
    renderWorkstationDock();
  },
  onLiftButtonClick: () => audioManager.playLiftButtonClick?.(),
  onLiftMoveStart: () => audioManager.playLiftMoveRumble?.(),
  onLiftDing: () => audioManager.playLiftDing?.()
});
window.kwrWorld = world;
window.kwrState = state;

init();

function init() {
  hydrateForm();
  renderAgentSelect();
  renderChecklist();
  renderExperimentLog();
  renderKanban();
  renderMission();
  renderMinimap();
  updateVoiceUI();
  hydrateAudioControls();
  applyFocusMode(false);
  world.setNpcBehaviorEnabled(state.npcBehaviorEnabled && !state.focusMode);
  world.setCollisionDebugEnabled(state.collisionDebugEnabled);
  world.setLookSensitivity?.(state.lookSensitivity ?? 0.96);
  world.setStrategyLight?.(state.officeAliveState?.strategyLight || (state.teamGathered ? 'meeting' : 'idle'));
  if (state.teamGathered) world.gatherTeam();
  updateTeamButton();
  updateNpcStatus();
  setActiveAgent(activeAgentId, true);
  renderWorkstationDock();
  renderWorkspace();
  renderRouterLog();
  bindUI();
  ensureProjectMetadata(false);
  addSystemChat('Selamat datang. Mulai dari Mission tab: isi link Kaggle, lalu jalankan Analisis & Download Kaggle.');
  setupQaMode();
}

function setupQaMode() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('qaWorld')) return;
  document.body.classList.add('qaWorld');
  togglePanel(false);
  world.unlock();
}

function hydrateForm() {
  dom.competitionLink.value = state.competitionLink;
  dom.problemType.value = state.problemType || 'Belum dianalisis';
  dom.briefText.value = state.briefText;
  dom.whiteboardText.value = state.whiteboard;
  state.backendBaseUrl = normalizeLocalBackendUrl(state.backendBaseUrl || 'http://127.0.0.1:7860');
  state.llmEndpoint = normalizeLocalBackendUrl(state.llmEndpoint || `${state.backendBaseUrl.replace(/\/$/, '')}/api/chat`);
  state.llmModelLabel = normalizeBackendModelId(state.llmModelLabel);
  saveStatePatch({ llmModelLabel: state.llmModelLabel });
  dom.backendBaseUrl.value = state.backendBaseUrl;
  dom.llmEndpoint.value = state.llmEndpoint;
  dom.llmModelLabel.value = state.llmModelLabel;
  dom.chatInput.value = state.transcriptDraft || '';
  dom.musicToggle.checked = Boolean(state.audioSettings?.musicEnabled);
  dom.ambienceToggle.checked = Boolean(state.audioSettings?.ambienceEnabled);
  dom.musicVolume.value = state.audioSettings?.musicVolume ?? 0.55;
  dom.ambienceVolume.value = state.audioSettings?.ambienceVolume ?? 0.58;
  dom.voiceVolume.value = state.audioSettings?.voiceVolume ?? 0.85;
  dom.npcBehaviorToggle.checked = state.npcBehaviorEnabled !== false;
  dom.collisionDebugToggle.checked = Boolean(state.collisionDebugEnabled);
  dom.lookSensitivity.value = state.lookSensitivity ?? 0.96;
  dom.routerMode.value = state.missionRouter?.mode || 'fast';
  dom.meetingModeSelect.value = state.meetingStageState?.mode || 'strategy';
}

function bindUI() {
  dom.panelTabs.forEach(btn => btn.addEventListener('click', () => showPane(btn.dataset.panelTab)));
  dom.panelEdgeTab.addEventListener('click', () => togglePanel());
  dom.togglePanelBtn.addEventListener('click', () => togglePanel(false));
  dom.enterWorldBtn.addEventListener('click', () => world.lock());
  dom.cursorModeBtn.addEventListener('click', () => world.unlock());
  dom.gatherTeamBtn.addEventListener('click', toggleTeamGathering);
  dom.goWarRoomBtn.addEventListener('click', () => {
    world.teleportToWarRoom();
    toast('Teleport ke Glass War Room.');
  });
  dom.goFloor2Btn.addEventListener('click', () => {
    if (world.isNearElevator()) {
      toast('Masuk ke kabin lift, lalu tekan E pada tombol F1/F2/F3 di dinding kanan.');
      return;
    }
    toast('Pergi ke area lift dulu. Pindah lantai sekarang lewat tombol fisik di dalam lift.');
  });
  dom.voiceToggleBtn.addEventListener('click', () => {
    state.voiceEnabled = false;
    state.audioSettings = { ...(state.audioSettings || {}), voiceEnabled: false };
    saveStatePatch({ voiceEnabled: false, audioSettings: state.audioSettings });
    updateVoiceUI();
  });
  dom.focusModeBtn.addEventListener('click', toggleFocusMode);
  dom.musicToggle.addEventListener('change', () => updateAudioSetting('musicEnabled', dom.musicToggle.checked));
  dom.ambienceToggle.addEventListener('change', () => updateAudioSetting('ambienceEnabled', dom.ambienceToggle.checked));
  dom.musicVolume.addEventListener('input', () => updateAudioSetting('musicVolume', Number(dom.musicVolume.value)));
  dom.ambienceVolume.addEventListener('input', () => updateAudioSetting('ambienceVolume', Number(dom.ambienceVolume.value)));
  dom.voiceVolume.addEventListener('input', () => updateAudioSetting('voiceVolume', Number(dom.voiceVolume.value)));
  dom.npcBehaviorToggle.addEventListener('change', () => {
    state.npcBehaviorEnabled = dom.npcBehaviorToggle.checked;
    saveStatePatch({ npcBehaviorEnabled: state.npcBehaviorEnabled });
    if (state.npcBehaviorEnabled) {
      world.dismissTeam();
      state.teamGathered = false;
      saveStatePatch({ teamGathered: false });
      updateTeamButton();
    }
    world.setNpcBehaviorEnabled(state.npcBehaviorEnabled && !state.focusMode);
    toast(state.npcBehaviorEnabled ? 'Coworker mulai bergerak santai.' : 'Coworker dibuat diam.');
    updateNpcStatus();
  });
  dom.collisionDebugToggle.addEventListener('change', () => {
    state.collisionDebugEnabled = dom.collisionDebugToggle.checked;
    saveStatePatch({ collisionDebugEnabled: state.collisionDebugEnabled });
    world.setCollisionDebugEnabled(state.collisionDebugEnabled);
    toast(state.collisionDebugEnabled ? 'QA collision overlay aktif.' : 'QA collision overlay dimatikan.');
  });
  dom.lookSensitivity.addEventListener('input', () => {
    state.lookSensitivity = Number(dom.lookSensitivity.value);
    saveStatePatch({ lookSensitivity: state.lookSensitivity });
    world.setLookSensitivity?.(state.lookSensitivity);
  });
  dom.routerMode.addEventListener('change', () => {
    state.missionRouter = { ...(state.missionRouter || {}), mode: dom.routerMode.value };
    saveStatePatch({ missionRouter: state.missionRouter });
  });
  dom.routerAskBtn.addEventListener('click', askMissionRouter);
  dom.routerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askMissionRouter();
    }
  });
  dom.workspaceScanBtn.addEventListener('click', scanWorkspace);
  dom.workspaceRunBtn.addEventListener('click', runActiveWorkspaceFile);
  dom.workspaceReviewBtn.addEventListener('click', askWorkspaceReview);
  dom.templateButtons.forEach(btn => btn.addEventListener('click', () => createWorkspaceTemplate(btn.dataset.template)));
  dom.saveBriefBtn.addEventListener('click', saveBrief);
  dom.buildPlanBtn.addEventListener('click', () => {
    saveBrief();
    const plan = buildPlanFromState(state);
    dom.whiteboardText.value = plan;
    state.whiteboard = plan;
    saveStatePatch({ whiteboard: plan });
    renderKanban();
    addSystemChat('Plan awal dibuat dari brief dan metadata, lalu disimpan ke whiteboard.');
    toast('Plan awal dibuat.');
  });
  dom.kaggleAnalyzeBtn.addEventListener('click', analyzeCompetition);
  dom.agentSelect.addEventListener('change', (e) => setActiveAgent(e.target.value));
  dom.openConversationBtn.addEventListener('click', () => openConversation(activeAgentId));
  dom.sendChatBtn.addEventListener('click', sendChat);
  dom.chatInput.addEventListener('input', () => {
    state.transcriptDraft = dom.chatInput.value;
    saveStatePatch({ transcriptDraft: state.transcriptDraft });
  });
  dom.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  dom.recordTranscriptBtn.addEventListener('click', startRecording);
  dom.stopTranscriptBtn.addEventListener('click', stopRecording);
  dom.startMeetingBtn.addEventListener('click', startMeeting);
  dom.summarizeMeetingBtn.addEventListener('click', summarizeCurrentMeeting);
  dom.meetingModeSelect.addEventListener('change', () => {
    state.meetingStageState = { ...(state.meetingStageState || {}), mode: getMeetingMode() };
    saveStatePatch({ meetingStageState: state.meetingStageState });
  });
  dom.conversationCloseBtn.addEventListener('click', closeConversation);
  dom.conversationSendBtn.addEventListener('click', sendConversationMessage);
  dom.conversationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendConversationMessage();
    }
  });
  dom.conversationQuickActions.forEach(btn => btn.addEventListener('click', () => sendConversationPrompt(btn.dataset.convPrompt)));
  dom.conversationSendBoardBtn.addEventListener('click', sendConversationToBoard);
  dom.debateCloseBtn.addEventListener('click', closeDebateStage);
  dom.debateRetryBtn.addEventListener('click', () => runDebateStage(currentDebateTopic || dom.meetingTopic.value.trim(), getMeetingMode()));
  dom.debateSaveBtn.addEventListener('click', saveDebateSummary);
  dom.saveTranscriptBtn.addEventListener('click', saveDebateTranscript);
  dom.sendDecisionsToBoardBtn.addEventListener('click', sendDebateDecisionsToBoard);
  dom.arcadeCloseBtn.addEventListener('click', closeArcade);
  document.querySelectorAll('[data-standup]').forEach(btn => btn.addEventListener('click', () => applyStandupPrompt(btn.dataset.standup)));
  dom.addExperimentBtn.addEventListener('click', addExperiment);
  dom.openWhiteboardBtn.addEventListener('click', () => {
    renderKanban();
    dom.whiteboardDialog.showModal();
  });
  dom.saveWhiteboardBtn.addEventListener('click', () => {
    state.whiteboard = dom.whiteboardText.value;
    saveStatePatch({ whiteboard: state.whiteboard });
    toast('Whiteboard disimpan di browser lokal.');
  });
  dom.generateWhiteboardBtn.addEventListener('click', () => {
    saveBrief();
    dom.whiteboardText.value = buildPlanFromState(state);
    state.whiteboard = dom.whiteboardText.value;
    saveStatePatch({ whiteboard: state.whiteboard });
    renderKanban();
    toast('Whiteboard diisi ulang dari brief dan metadata.');
  });
  dom.applyOnboardingBtn.addEventListener('click', () => {
    dom.onboardingDialog.close();
    showPane('mission');
    togglePanel(true);
    toast('Alur onboarding diterapkan.');
  });
  dom.openDocsBtn.addEventListener('click', () => window.open('./docs/DEVELOPMENT_ROADMAP.md', '_blank'));
  dom.saveLlmBtn.addEventListener('click', saveSettings);
  dom.rpgCloseBtn.addEventListener('click', closeRpgDialog);
  dom.officeInteractionCloseBtn.addEventListener('click', closeOfficeInteraction);
  dom.workstationStandBtn.addEventListener('click', () => world.standFromSeat());
  dom.workstationMissionBtn.addEventListener('click', () => {
    togglePanel(true);
    showPane('mission');
    renderWorkstationDock('Mission tab dibuka. Cek link, data profile, dan status download sebelum lanjut eksperimen.');
  });
  dom.workstationAdvisorBtn.addEventListener('click', () => {
    setActiveAgent('raka-data', true);
    togglePanel(true);
    showPane('advisor');
    dom.chatInput.value = 'Jelaskan struktur data lokal dan risiko data leakage dari project ini.';
    dom.chatInput.focus();
    renderWorkstationDock('Prompt untuk Raka sudah disiapkan di Advisor Chat.');
  });
  dom.workstationExperimentBtn.addEventListener('click', addWorkstationExperiment);
  dom.workstationBoardBtn.addEventListener('click', () => {
    togglePanel(true);
    showPane('board');
    renderWorkstationDock('Board dibuka. Update checklist dan experiment log setelah keputusan dibuat.');
  });
  dom.workstationFocusBtn.addEventListener('click', () => {
    if (!state.focusMode) toggleFocusMode();
    renderWorkstationDock('Focus Mode aktif. Audio diredam dan coworker wandering dekat kamu dimatikan.');
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!dom.conversationOverlay.hidden) closeConversation();
      else if (!dom.debateStageOverlay.hidden) closeDebateStage();
      else if (!dom.arcadeOverlay.hidden) closeArcade();
      else if (!dom.officeInteractionOverlay.hidden) closeOfficeInteraction();
      else closeRpgDialog();
      world.unlock();
    }
  });
}

function showPane(name) {
  dom.panelTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.panelTab === name));
  dom.panelPanes.forEach(pane => pane.classList.toggle('active', pane.dataset.panelPane === name));
}

function saveBrief() {
  state.competitionLink = dom.competitionLink.value.trim();
  state.problemType = dom.problemType.value;
  state.briefText = dom.briefText.value.trim();
  saveStatePatch({ competitionLink: state.competitionLink, problemType: state.problemType, briefText: state.briefText });
  ensureProjectMetadata(false);
  renderMission();
  toast('Brief kompetisi tersimpan.');
}

function saveSettings() {
  state.backendBaseUrl = normalizeLocalBackendUrl(dom.backendBaseUrl.value.trim() || 'http://127.0.0.1:7860');
  state.llmEndpoint = normalizeLocalBackendUrl(dom.llmEndpoint.value.trim() || `${state.backendBaseUrl.replace(/\/$/, '')}/api/chat`);
  state.llmModelLabel = normalizeBackendModelId(dom.llmModelLabel.value.trim() || 'gemma3:4b');
  dom.backendBaseUrl.value = state.backendBaseUrl;
  dom.llmEndpoint.value = state.llmEndpoint;
  dom.llmModelLabel.value = state.llmModelLabel;
  saveStatePatch({
    backendBaseUrl: state.backendBaseUrl,
    llmEndpoint: state.llmEndpoint,
    llmModelLabel: state.llmModelLabel
  });
  toast('Konfigurasi backend dan LLM tersimpan.');
}

function normalizeLocalBackendUrl(url) {
  return String(url || '').trim().replace('http://localhost:7860', 'http://127.0.0.1:7860');
}

function hydrateAudioControls() {
  dom.musicToggle.checked = Boolean(state.audioSettings?.musicEnabled);
  dom.ambienceToggle.checked = Boolean(state.audioSettings?.ambienceEnabled);
  dom.musicVolume.value = state.audioSettings?.musicVolume ?? 0.55;
  dom.ambienceVolume.value = state.audioSettings?.ambienceVolume ?? 0.58;
  dom.voiceVolume.value = state.audioSettings?.voiceVolume ?? 0.85;
  dom.npcBehaviorToggle.checked = state.npcBehaviorEnabled !== false;
  audioManager.apply(state.audioSettings || {});
}

async function updateAudioSetting(key, value) {
  state.audioSettings = { ...(state.audioSettings || {}), [key]: value };
  if (key === 'voiceVolume') state.voiceEnabled = state.audioSettings.voiceEnabled !== false;
  saveStatePatch({ audioSettings: state.audioSettings });
  await audioManager.resume();
  audioManager.apply(state.audioSettings);
  audioManager.setFocusMode(state.focusMode);
  if (key === 'musicEnabled' || key === 'ambienceEnabled') toast(value ? 'Audio atmosphere aktif.' : 'Audio atmosphere dimatikan.');
}

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  saveStatePatch({ focusMode: state.focusMode });
  applyFocusMode(true);
}

function applyFocusMode(showToast = true) {
  world.setNpcBehaviorEnabled(state.npcBehaviorEnabled && !state.focusMode);
  audioManager.setFocusMode(state.focusMode);
  dom.focusModeBtn.textContent = state.focusMode ? 'Focus Mode: On' : 'Focus Mode';
  document.body.classList.toggle('focusMode', state.focusMode);
  if (showToast) toast(state.focusMode ? 'Focus Mode aktif: ambience turun dan NPC lebih tenang.' : 'Focus Mode mati.');
  updateNpcStatus();
}

function renderWorkstationDock(message = '') {
  const active = state.seatMode?.active && state.seatMode?.kind === 'workstation';
  dom.workstationDock.hidden = !active;
  if (!active) return;
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || '') || 'Belum ada project';
  const files = state.kaggleMetadata?.files?.length || 0;
  const tables = state.kaggleMetadata?.data_profile?.tables?.length || 0;
  const experiments = state.experimentLog?.length || 0;
  dom.workstationTitle.textContent = state.seatMode.label || 'Workstation chair';
  dom.workstationOutput.innerHTML = `
    <div><strong>${escapeHtml(slug)}</strong><span>${escapeHtml(state.problemType || 'Belum dianalisis')}</span></div>
    <div class="workstationStats">
      <span>${files} files</span>
      <span>${tables} tables</span>
      <span>${experiments} experiments</span>
    </div>
    <p>${escapeHtml(message || 'Mode kerja aktif. Pilih aksi cepat untuk lanjut dari kursi workstation.')}</p>
  `;
}

function addWorkstationExperiment() {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || '') || 'project';
  const nextIndex = (state.experimentLog?.length || 0) + 1;
  const name = `E${String(nextIndex).padStart(2, '0')} ${slug}: baseline validation sanity check`;
  state.experimentLog = [...(state.experimentLog || []), {
    name,
    score: 'planned',
    ts: new Date().toISOString()
  }];
  saveStatePatch({ experimentLog: state.experimentLog });
  renderExperimentLog();
  renderWorkstationDock('Next experiment dicatat sebagai planned. Buka Board untuk edit score/keputusan setelah dijalankan.');
  toast('Next experiment ditambahkan dari workstation.');
}

function applyStandupPrompt(kind) {
  const prompts = {
    learned: 'Standup: Apa insight paling penting dari eksperimen terakhir? Data/metric apa yang berubah?',
    next: 'Standup: Eksperimen berikutnya apa yang paling murah, jelas, dan bisa mengurangi ketidakpastian?',
    risk: 'Standup: Risiko terbesar sebelum submission apa? Leakage, split, format file, atau overfit?'
  };
  dom.meetingTopic.value = prompts[kind] || prompts.learned;
  toast('Prompt standup dimasukkan ke topik rapat.');
}

async function analyzeCompetition() {
  saveBrief();
  if (!state.competitionLink) {
    toast('Isi link atau slug Kaggle dulu.');
    return;
  }
  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  state.downloadStatus = { status: 'running', message: 'Menghubungi backend Kaggle...' };
  saveStatePatch({ downloadStatus: state.downloadStatus });
  renderMission();
  dom.kaggleAnalyzeBtn.disabled = true;
  try {
    const res = await fetch(`${base}/api/kaggle/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition: state.competitionLink, download: true, overwrite: false })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    Object.assign(state, applyAnalyzeResult(state, data));
    saveStatePatch({
      currentProject: state.currentProject,
      kaggleMetadata: state.kaggleMetadata,
      downloadStatus: state.downloadStatus
    });
    renderMission();
    await scanWorkspace(true);
    renderKanban();
    renderChecklist();
    addSystemChat(`Analisis Kaggle selesai untuk ${state.currentProject.slug}. Advisor sekarang menerima metadata dan data profile di context.`);
    if (state.kaggleMetadata.warnings?.length) toast('Analisis selesai dengan warning. Cek Metadata & Data Profile.');
    else toast('Metadata dan data Kaggle siap.');
  } catch (err) {
    const imported = await ensureProjectMetadata(true);
    if (imported) {
      toast('Backend Kaggle gagal, tapi metadata/data lokal berhasil dimuat.');
    } else {
      state.downloadStatus = { status: 'error', message: `Gagal analisis: ${err.message}` };
      saveStatePatch({ downloadStatus: state.downloadStatus });
      renderMission();
      toast('Backend Kaggle belum siap atau gagal.');
    }
  } finally {
    dom.kaggleAnalyzeBtn.disabled = false;
  }
}

async function ensureProjectMetadata(force = false) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || dom.competitionLink?.value || '');
  if (!slug) return false;
  const hasProfile = (state.kaggleMetadata?.data_profile?.tables || []).length || (state.kaggleMetadata?.data_profile?.files || []).length;
  if (!force && hasProfile && state.kaggleMetadata?.slug === slug) return false;

  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/kaggle/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition: slug, download: false, overwrite: false })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    Object.assign(state, applyAnalyzeResult(state, data));
    saveStatePatch({
      currentProject: state.currentProject,
      kaggleMetadata: state.kaggleMetadata,
      downloadStatus: state.downloadStatus
    });
    renderMission();
    await scanWorkspace(true);
    renderKanban();
    renderChecklist();
    if (hasUsableProjectMetadata()) return true;
    return await probeLocalRawFiles(slug);
  } catch (backendErr) {
    try {
      const res = await fetch(`./data/competitions/${encodeURIComponent(slug)}/metadata.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      Object.assign(state, applyAnalyzeResult(state, data));
      saveStatePatch({
        currentProject: state.currentProject,
        kaggleMetadata: state.kaggleMetadata,
        downloadStatus: state.downloadStatus
      });
      renderMission();
      await scanWorkspace(true);
      renderKanban();
      renderChecklist();
      if (hasUsableProjectMetadata()) return true;
      return await probeLocalRawFiles(slug);
    } catch (staticErr) {
      const probed = await probeLocalRawFiles(slug);
      if (probed) return true;
      console.warn('No local project metadata available yet.', backendErr, staticErr);
      return false;
    }
  }
}

function hasUsableProjectMetadata() {
  return Boolean(
    (state.kaggleMetadata?.files || []).length ||
    (state.kaggleMetadata?.data_profile?.files || []).length ||
    (state.kaggleMetadata?.data_profile?.tables || []).length
  );
}

async function probeLocalRawFiles(slug) {
  const candidates = [
    'train.csv',
    'test.csv',
    'sample_submission.csv',
    'submission.csv',
    'data.csv',
    'labels.csv'
  ];
  const found = [];
  for (const name of candidates) {
    try {
      const url = `./data/competitions/${encodeURIComponent(slug)}/raw/${encodeURIComponent(name)}?ts=${Date.now()}`;
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        found.push({
          name,
          size_bytes: Number(res.headers.get('content-length') || 0) || undefined,
          source: 'local-raw-probe'
        });
      }
    } catch {
      // Keep probing other conventional Kaggle filenames.
    }
  }
  if (!found.length) return false;
  const result = {
    slug,
    files: found,
    download_path: `data/competitions/${slug}/raw`,
    metadata: { source: 'local-raw-probe', note: 'Detected files directly from static raw folder.' },
    data_profile: {
      files_scanned: found.length,
      files: found,
      tables: found.filter(file => file.name.toLowerCase().endsWith('.csv')).map(file => ({
        name: file.name,
        rows: null,
        columns: [],
        note: 'Backend belum memprofilkan isi CSV; file lokal terdeteksi.'
      }))
    },
    warnings: ['Backend metadata/profile belum tersedia; memakai deteksi file lokal dari browser.'],
    needs_user_confirmation: false
  };
  Object.assign(state, applyAnalyzeResult(state, result));
  saveStatePatch({
    currentProject: state.currentProject,
    kaggleMetadata: state.kaggleMetadata,
    downloadStatus: state.downloadStatus
  });
  renderMission();
  scanWorkspace(true);
  renderKanban();
  renderChecklist();
  return true;
}

function renderAgentSelect() {
  dom.agentSelect.innerHTML = AGENTS.map(agent => `<option value="${agent.id}">${agent.name} - ${agent.role}</option>`).join('');
  dom.agentSelect.value = activeAgentId;
}

function setActiveAgent(agentId, silent = false) {
  activeAgentId = agentId;
  const agent = getAgent(agentId);
  dom.agentSelect.value = agent.id;
  dom.activeAgentBox.innerHTML = `<strong>${agent.name} - ${agent.role}</strong><span>Expertise: ${agent.expertise.join(', ')}</span>`;
  if (!silent) {
    showPane('advisor');
    togglePanel(true);
    addAgentChat(agent, agent.opener);
  }
}

function renderChecklist() {
  const checked = new Set(state.checklist || []);
  dom.workflowChecklist.innerHTML = WORKFLOW_HTML(checked);
  dom.workflowChecklist.onchange = (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
      const all = [...dom.workflowChecklist.querySelectorAll('input[type="checkbox"]')].filter(i => i.checked).map(i => i.dataset.step);
      state.checklist = all;
      saveStatePatch({ checklist: all });
    }
  };
}

function WORKFLOW_HTML(checked) {
  return [
    { id: 'intake', title: 'Mission intake', detail: 'Link, metric, rules, deadline, dan file list.' },
    { id: 'download', title: 'Download & profile data', detail: 'Backend Kaggle mengambil data ke data/competitions/<slug>/raw.' },
    { id: 'eda', title: 'EDA terarah', detail: 'Hipotesis dan data quality sebelum modeling.' },
    { id: 'validation', title: 'Validation design', detail: 'Split yang meniru private leaderboard.' },
    { id: 'baseline', title: 'Baseline reproducible', detail: 'Notebook minimal, seed, dan first valid submission.' },
    { id: 'review', title: 'Peer review', detail: 'Leakage, sample submission, dan decision log.' }
  ].map(step => `
    <label class="checkItem">
      <input type="checkbox" data-step="${step.id}" ${checked.has(step.id) ? 'checked' : ''} />
      <span><strong>${step.title}</strong><small>${step.detail}</small></span>
    </label>
  `).join('');
}

function renderKanban() {
  const items = buildKanbanItems(state);
  dom.kanbanBoard.innerHTML = Object.entries(items).map(([col, list]) => `
    <div class="kanbanCol">
      <h4>${col}</h4>
      ${list.map(item => `<div class="sticky">${escapeHtml(item)}</div>`).join('')}
    </div>
  `).join('');
}

function renderExperimentLog() {
  const items = state.experimentLog || [];
  dom.experimentLog.innerHTML = items.length
    ? items.map((item, idx) => `<div class="experimentItem"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.score || 'no score')}</span><button data-remove-exp="${idx}" class="miniBtn">Remove</button></div>`).join('')
    : '<p class="hint">Belum ada eksperimen. Catat baseline, CV, LB, dan keputusan di sini.</p>';
  dom.experimentLog.querySelectorAll('[data-remove-exp]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.experimentLog.splice(Number(btn.dataset.removeExp), 1);
      saveStatePatch({ experimentLog: state.experimentLog });
      renderExperimentLog();
    });
  });
}

function addExperiment() {
  const name = dom.experimentName.value.trim();
  const score = dom.experimentScore.value.trim();
  if (!name) {
    toast('Isi nama eksperimen dulu.');
    return;
  }
  state.experimentLog = [...(state.experimentLog || []), { name, score, ts: new Date().toISOString() }];
  saveStatePatch({ experimentLog: state.experimentLog });
  dom.experimentName.value = '';
  dom.experimentScore.value = '';
  renderExperimentLog();
  toast('Eksperimen dicatat.');
}

function renderMission() {
  const slug = state.currentProject?.slug || 'Belum ada project aktif';
  const status = state.downloadStatus?.status || 'idle';
  const files = state.kaggleMetadata?.files || [];
  const tables = state.kaggleMetadata?.data_profile?.tables || [];
  const warnings = state.kaggleMetadata?.warnings || [];
  dom.currentProjectSummary.textContent = slug === 'Belum ada project aktif' ? slug : `${slug} - ${status}`;
  dom.missionStatus.textContent = state.downloadStatus?.message || 'Masukkan link/slug lalu jalankan analisis.';
  dom.metadataSummary.innerHTML = `
    <div class="metricGrid">
      <div><strong>${files.length}</strong><span>File Kaggle</span></div>
      <div><strong>${tables.length}</strong><span>Tabel lokal</span></div>
      <div><strong>${warnings.length}</strong><span>Warning</span></div>
    </div>
    ${files.length ? `<h3>Files</h3><ul>${files.slice(0, 8).map(file => `<li>${escapeHtml(file.name || file.ref || file.raw || 'file')}</li>`).join('')}</ul>` : ''}
    ${tables.length ? `<h3>Data Facts</h3><ul>${tables.slice(0, 6).map(t => `<li>${escapeHtml(t.name)} - ${t.rows ?? '?'} rows, ${(t.columns || []).length} columns, ${escapeHtml(t.size_human || 'size unknown')}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<h3>Warnings</h3><ul class="warnings">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
  `;
}

async function scanWorkspace(silent = false) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || dom.competitionLink.value || '');
  if (!slug) {
    if (!silent) toast('Isi link/slug project dulu.');
    return false;
  }
  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  if (!silent) dom.workspaceStatus.textContent = 'Scanning workspace...';
  try {
    const res = await fetch(`${base}/api/workspace/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition: slug })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    state.workspaceState = {
      ...(state.workspaceState || {}),
      ...data,
      activeFile: state.workspaceState?.activeFile || data.code_files?.[0]?.path || ''
    };
    saveStatePatch({ workspaceState: state.workspaceState });
    renderWorkspace();
    if (!silent) toast('Workspace discan.');
    return true;
  } catch (err) {
    dom.workspaceStatus.textContent = `Workspace scan gagal: ${err.message}`;
    if (!silent) toast('Backend workspace belum siap.');
    return false;
  }
}

function renderWorkspace() {
  const ws = state.workspaceState || {};
  const files = ws.code_files || [];
  dom.workspaceStatus.textContent = ws.slug
    ? `${ws.slug}: ${files.length} code files, ${(ws.runs || []).length} run logs.`
    : 'Belum scan workspace.';
  dom.workspaceFiles.innerHTML = files.length
    ? files.map(file => `
      <button class="workspaceFile ${file.path === ws.activeFile ? 'active' : ''}" data-workspace-file="${escapeText(file.path)}">
        <strong>${escapeText(file.name || file.path)}</strong>
        <span>${escapeText(file.suffix || '')} Â· ${escapeText(file.size_human || 'unknown')}</span>
      </button>
    `).join('')
    : '<p class="hint">Belum ada notebook/script. Buat template atau taruh file di folder code.</p>';
  dom.workspaceFiles.querySelectorAll('[data-workspace-file]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.workspaceState = { ...(state.workspaceState || {}), activeFile: btn.dataset.workspaceFile };
      saveStatePatch({ workspaceState: state.workspaceState });
      renderWorkspace();
    });
  });
  const active = files.find(file => file.path === ws.activeFile) || files[0];
  if (active) {
    state.workspaceState.activeFile = active.path;
    dom.workspacePreview.innerHTML = `
      <strong>${escapeText(active.path)}</strong>
      <pre>${escapeText(active.preview || active.preview_error || 'No preview available.')}</pre>
    `;
  } else {
    dom.workspacePreview.textContent = 'Pilih file notebook/script.';
  }
  const latest = ws.latest_run;
  dom.workspaceRunLog.innerHTML = latest
    ? `<strong>Latest run: ${escapeText(latest.status)}</strong><pre>${escapeText((latest.stdout || latest.stderr || '').slice(-2400))}</pre>`
    : '<p class="hint">Belum ada run log.</p>';
}

async function createWorkspaceTemplate(template) {
  const slug = state.currentProject?.slug || extractCompetitionSlug(state.competitionLink || dom.competitionLink.value || '');
  if (!slug) {
    toast('Isi project dulu.');
    return;
  }
  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/workspace/create-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition: slug, template })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    state.workspaceState = { ...(state.workspaceState || {}), ...data, activeFile: data.path };
    saveStatePatch({ workspaceState: state.workspaceState });
    renderWorkspace();
    toast('Template notebook dibuat.');
  } catch (err) {
    toast(`Gagal membuat template: ${err.message}`);
  }
}

async function runActiveWorkspaceFile() {
  const ws = state.workspaceState || {};
  const activePath = ws.activeFile || ws.code_files?.[0]?.path;
  if (!activePath) {
    toast('Pilih file dulu.');
    return;
  }
  const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
  dom.workspaceRunBtn.disabled = true;
  dom.workspaceRunLog.innerHTML = '<p class="hint">Running safe notebook/script...</p>';
  try {
    const res = await fetch(`${base}/api/workspace/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competition: ws.slug || state.currentProject?.slug || state.competitionLink,
        path: activePath,
        timeout_seconds: Number(dom.workspaceTimeout.value || 120)
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    state.workspaceState = { ...(state.workspaceState || {}), ...data, activeFile: activePath, latest_run: data };
    state.experimentLog = [...(state.experimentLog || []), {
      name: `Run ${activePath}`,
      score: data.status,
      ts: new Date().toISOString()
    }];
    saveStatePatch({ workspaceState: state.workspaceState, experimentLog: state.experimentLog });
    renderWorkspace();
    renderExperimentLog();
    toast(`Run selesai: ${data.status}`);
  } catch (err) {
    dom.workspaceRunLog.innerHTML = `<p class="warnings">Run gagal: ${escapeText(err.message)}</p>`;
  } finally {
    dom.workspaceRunBtn.disabled = false;
  }
}

async function askWorkspaceReview() {
  await scanWorkspace(true);
  const ws = state.workspaceState || {};
  const active = (ws.code_files || []).find(file => file.path === ws.activeFile) || ws.code_files?.[0];
  if (!active) {
    toast('Belum ada file untuk direview.');
    return;
  }
  showPane('advisor');
  dom.routerMode.value = 'panel';
  state.missionRouter = { ...(state.missionRouter || {}), mode: 'panel' };
  dom.routerInput.value = `Review notebook/script ${active.path}. Cari bug, leakage, validasi yang lemah, dan next action. Gunakan preview dan latest run dari workspace context.`;
  await askMissionRouter();
}

function renderMinimap() {
  const rooms = ROOMS.filter(room => room.floor === activeFloor);
  dom.miniMap.innerHTML = `
    <strong>Floor ${activeFloor}</strong>
    <span>${escapeHtml(activeRoom)}</span>
    <div>${rooms.map(room => `<i class="${room.name === activeRoom ? 'active' : ''}">${escapeHtml(room.name.replace(' & ', ' / '))}</i>`).join('')}</div>
  `;
}

function openConversation(agentId = activeAgentId) {
  const agent = getAgent(agentId);
  activeConversationAgentId = agent.id;
  setActiveAgent(agent.id, true);
  world.unlock();
  closeRpgDialog();
  dom.conversationOverlay.hidden = false;
  dom.conversationKicker.textContent = 'Coworker Conversation';
  dom.conversationTitle.textContent = `${agent.name} - ${agent.role}`;
  dom.conversationSubtitle.textContent = `Expertise: ${agent.expertise.join(', ')}`;
  const saved = state.conversationState?.agentId === agent.id ? state.conversationState.messages || [] : [];
  if (!saved.length) {
    state.conversationState = {
      active: true,
      agentId: agent.id,
      messages: [{ role: 'agent', agentId: agent.id, text: agent.opener }],
      lastPrompt: ''
    };
  } else {
    state.conversationState = { ...(state.conversationState || {}), active: true, agentId: agent.id, messages: saved };
  }
  saveStatePatch({ conversationState: state.conversationState });
  renderConversation();
  dom.conversationInput.focus();
}

function closeConversation() {
  dom.conversationOverlay.hidden = true;
  state.conversationState = { ...(state.conversationState || {}), active: false };
  saveStatePatch({ conversationState: state.conversationState });
}

function renderConversation() {
  const messages = state.conversationState?.messages || [];
  dom.conversationMessages.innerHTML = messages.map(msg => {
    const agent = getAgent(msg.agentId || activeConversationAgentId);
    const speaker = msg.role === 'user' ? 'Anda' : `${agent.name} - ${agent.role}`;
    const body = msg.role === 'user' ? `<p>${escapeText(msg.text)}</p>` : renderRichText(msg.text);
    return `
      <article class="conversationMessage ${msg.role}">
        <strong>${escapeText(speaker)}</strong>
        <div class="${msg.role === 'user' ? '' : 'richText'}">${body}</div>
      </article>
    `;
  }).join('');
  dom.conversationMessages.scrollTop = dom.conversationMessages.scrollHeight;
}

async function sendConversationPrompt(kind) {
  const prompt = CONVERSATION_PROMPTS[kind] || CONVERSATION_PROMPTS.project;
  dom.conversationInput.value = prompt;
  await sendConversationMessage();
}

async function sendConversationMessage() {
  const message = dom.conversationInput.value.trim();
  if (!message) return;
  saveBrief();
  await ensureProjectMetadata(false);
  const agent = getAgent(activeConversationAgentId);
  const messages = [...(state.conversationState?.messages || [])];
  messages.push({ role: 'user', text: message });
  const thinkingIndex = messages.push({ role: 'agent', agentId: agent.id, text: 'Sedang menyusun jawaban...' }) - 1;
  state.conversationState = { active: true, agentId: agent.id, messages, lastPrompt: message };
  saveStatePatch({ conversationState: state.conversationState });
  dom.conversationInput.value = '';
  renderConversation();
  addUserChat(message);
  const compactNode = addAgentChat(agent, 'Sedang menyusun jawaban dari fullscreen conversation...');
  try {
    const answer = await askAdvisor(agent.id, message, state);
    lastConversationAnswer = answer;
    messages[thinkingIndex] = { role: 'agent', agentId: agent.id, text: answer };
    state.conversationState = { active: true, agentId: agent.id, messages, lastPrompt: message };
    saveStatePatch({ conversationState: state.conversationState });
    compactNode.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${renderRichText(answer)}`;
  } catch (err) {
    const fallback = `Maaf, saya gagal memproses jawaban. Cek backend LLM di Settings. Detail: ${err.message || 'unknown error'}`;
    messages[thinkingIndex] = { role: 'agent', agentId: agent.id, text: fallback };
    state.conversationState = { active: true, agentId: agent.id, messages, lastPrompt: message };
    saveStatePatch({ conversationState: state.conversationState });
    compactNode.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${escapeHtml(fallback)}`;
  }
  renderConversation();
}

function sendConversationToBoard() {
  const messages = state.conversationState?.messages || [];
  const latest = lastConversationAnswer || [...messages].reverse().find(msg => msg.role === 'agent')?.text || '';
  if (!latest) {
    toast('Belum ada jawaban untuk dikirim ke board.');
    return;
  }
  const agent = getAgent(activeConversationAgentId);
  state.whiteboard = `${state.whiteboard || dom.whiteboardText.value}\n\n${agent.name.toUpperCase()} NOTE\n${new Date().toLocaleString()}\n${stripProviderLine(latest)}`;
  dom.whiteboardText.value = state.whiteboard;
  saveStatePatch({ whiteboard: state.whiteboard });
  renderKanban();
  toast('Insight coworker dikirim ke whiteboard.');
}

function routeMissionAgents(message) {
  const text = String(message || '').toLowerCase();
  const matched = ROUTER_RULES.find(rule => rule.match.some(token => text.includes(token)));
  return matched ? matched.agents : ['maya-pm'];
}

function renderRouterLog() {
  const messages = state.missionRouter?.messages || [];
  dom.routerLog.innerHTML = messages.length
    ? messages.map(item => `
      <article class="routerItem ${item.role}">
        <strong>${escapeText(item.title || (item.role === 'user' ? 'Anda' : 'Mission Router'))}</strong>
        <div class="richText">${item.role === 'user' ? `<p>${escapeText(item.text)}</p>` : renderRichText(item.text)}</div>
      </article>
    `).join('')
    : '<p class="hint">Belum ada pertanyaan router.</p>';
  dom.routerLog.scrollTop = dom.routerLog.scrollHeight;
}

async function askMissionRouter() {
  const message = dom.routerInput.value.trim();
  if (!message) {
    toast('Isi pertanyaan Mission Router dulu.');
    return;
  }
  saveBrief();
  await ensureProjectMetadata(false);
  await scanWorkspace(true);
  const mode = dom.routerMode.value || 'fast';
  const agentIds = routeMissionAgents(message);
  const selected = mode === 'panel' ? agentIds.slice(0, 3) : agentIds.slice(0, 1);
  const messages = [...(state.missionRouter?.messages || []), { role: 'user', title: 'Anda', text: message }];
  state.missionRouter = { mode, messages };
  saveStatePatch({ missionRouter: state.missionRouter });
  dom.routerInput.value = '';
  renderRouterLog();
  dom.routerAskBtn.disabled = true;
  try {
    if (mode === 'fast') {
      const agent = getAgent(selected[0]);
      const prompt = `Mission Router intent: jawab sebagai advisor paling relevan (${agent.role}).\n\nPertanyaan user: ${message}\n\nGunakan data profile, workspace files, latest run, whiteboard, dan experiment log. Jangan mengarang ukuran dataset.`;
      const answer = await askAdvisor(agent.id, prompt, state);
      messages.push({ role: 'agent', title: `${agent.name} - ${agent.role}`, text: answer });
    } else {
      for (const agentId of selected) {
        const agent = getAgent(agentId);
        const prompt = `Panel Review singkat sebagai ${agent.role}.\n\nPertanyaan user: ${message}\n\nBerikan 3-5 poin paling penting. Gunakan workspace/data facts yang tersedia dan jangan menebak ukuran dataset.`;
        try {
          const answer = await askAdvisor(agent.id, prompt, state);
          messages.push({ role: 'agent', title: `${agent.name} - ${agent.role}`, text: answer });
        } catch (err) {
          messages.push({ role: 'agent', title: `${agent.name} - ${agent.role}`, text: `Gagal menjawab: ${err.message}` });
        }
        state.missionRouter = { mode, messages };
        saveStatePatch({ missionRouter: state.missionRouter });
        renderRouterLog();
      }
    }
    state.missionRouter = { mode, messages };
    saveStatePatch({ missionRouter: state.missionRouter });
    renderRouterLog();
  } finally {
    dom.routerAskBtn.disabled = false;
  }
}

async function sendChat() {
  const message = dom.chatInput.value.trim();
  if (!message) return;
  saveBrief();
  await ensureProjectMetadata(false);
  dom.chatInput.value = '';
  state.transcriptDraft = '';
  saveStatePatch({ transcriptDraft: '' });
  addUserChat(message);
  const agent = getAgent(activeAgentId);
  const thinking = addAgentChat(agent, 'Sedang menyusun jawaban...');
  try {
    const answer = await askAdvisor(activeAgentId, message, state);
    thinking.textContent = '';
    thinking.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${renderRichText(answer)}`;
  } catch (err) {
    thinking.textContent = '';
    thinking.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>Maaf, saya gagal memproses jawaban. Cek endpoint LLM atau gunakan mode lokal.`;
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    dom.transcriptStatus.textContent = 'Browser belum mendukung audio recording.';
    return;
  }
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(activeStream);
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = transcribeRecording;
    mediaRecorder.start();
    dom.recordTranscriptBtn.disabled = true;
    dom.stopTranscriptBtn.disabled = false;
    dom.transcriptStatus.textContent = 'Recording... tekan Stop untuk transcribe.';
  } catch (err) {
    dom.transcriptStatus.textContent = `Microphone gagal: ${err.message}`;
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  activeStream?.getTracks().forEach(track => track.stop());
  dom.stopTranscriptBtn.disabled = true;
  dom.transcriptStatus.textContent = 'Mengirim audio ke Whisper backend...';
}

async function transcribeRecording() {
  dom.recordTranscriptBtn.disabled = false;
  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  try {
    const base = (state.backendBaseUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
    const res = await fetch(`${base}/api/transcribe?language=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: blob
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    dom.chatInput.value = data.text || '';
    state.transcriptDraft = dom.chatInput.value;
    saveStatePatch({ transcriptDraft: state.transcriptDraft });
    dom.transcriptStatus.textContent = data.text ? `Transcript siap (${data.provider}).` : 'Whisper tidak menghasilkan teks.';
  } catch (err) {
    dom.transcriptStatus.textContent = `Transcribe gagal: ${err.message}`;
  }
}

async function startMeeting() {
  saveBrief();
  const topic = dom.meetingTopic.value.trim() || 'Susun strategi awal kompetisi Kaggle dari brief yang tersedia.';
  const mode = getMeetingMode();
  ensureTeamGathered();
  world.teleportToWarRoom();
  openDebateStage(topic, mode);
  await runDebateStage(topic, mode);
}

async function summarizeCurrentMeeting() {
  const topic = currentDebateTopic || dom.meetingTopic.value.trim() || 'Susun strategi awal kompetisi Kaggle dari brief yang tersedia.';
  const mode = getMeetingMode();
  openDebateStage(topic, mode);
  if (!lastMeetingOutputs.length) {
    setScribeStatus('idle', 'Belum ada rapat yang bisa diringkas. Jalankan Debate Stage dulu.');
    return;
  }
  renderDebateTranscript(lastMeetingTranscript);
  setScribeStatus('thinking', 'LLM Scribe sedang merapikan summary rapat terakhir...');
  try {
    const final = await generateMeetingSummary(lastMeetingOutputs.filter(item => !item.failed), topic, mode);
    dom.debateStageSummary.innerHTML = renderRichText(final);
    setScribeStatus('done', 'Summary rapat terakhir siap dibaca.');
    state.meetingStageState = { ...(state.meetingStageState || {}), active: true, topic, mode, summary: final, summaryStatus: 'done' };
  } catch (err) {
    const fallback = summarizeMeetingFallback(lastMeetingOutputs, topic, mode);
    dom.debateStageSummary.innerHTML = renderRichText(fallback);
    setScribeStatus('fallback', `LLM Scribe gagal (${err.message || 'backend error'}). Fallback lokal dipakai.`);
    state.meetingStageState = { ...(state.meetingStageState || {}), active: true, topic, mode, summary: fallback, summaryStatus: 'fallback' };
  }
  saveStatePatch({ meetingStageState: state.meetingStageState });
}

function openDebateStage(topic, mode = getMeetingMode()) {
  currentDebateTopic = topic || 'Susun strategi awal kompetisi Kaggle dari brief yang tersedia.';
  const modeConfig = getMeetingModeConfig(mode);
  dom.debateStageOverlay.hidden = false;
  dom.debateStageTopic.textContent = `${modeConfig.label} - ${currentDebateTopic}`;
  dom.debateStageSummary.innerHTML = '<p>Summary akan muncul setelah semua advisor selesai menjawab.</p>';
  setScribeStatus('idle', 'Menunggu transcript advisor.');
  const rows = DEBATE_AGENT_ORDER.map(id => ({ agent: getAgent(id), status: state.meetingStageState?.statusByAgent?.[id] || 'waiting', elapsedMs: 0 }));
  renderAdvisorRail(rows);
  renderDebateTranscript(lastMeetingTranscript);
  state.meetingStageState = {
    ...(state.meetingStageState || {}),
    active: true,
    topic: currentDebateTopic,
    mode,
    statusByAgent: Object.fromEntries(rows.map(row => [row.agent.id, row.status])),
    outputs: lastMeetingOutputs,
    transcript: lastMeetingTranscript,
    summary: state.meetingStageState?.summary || '',
    summaryStatus: state.meetingStageState?.summaryStatus || 'idle',
    savedDecisions: Boolean(state.meetingStageState?.savedDecisions)
  };
  saveStatePatch({ meetingStageState: state.meetingStageState });
}

function closeDebateStage() {
  dom.debateStageOverlay.hidden = true;
  state.meetingStageState = { ...(state.meetingStageState || {}), active: false };
  saveStatePatch({ meetingStageState: state.meetingStageState });
}

async function runDebateStage(topic, mode = getMeetingMode()) {
  currentDebateTopic = topic || currentDebateTopic || 'Susun strategi awal kompetisi Kaggle dari brief yang tersedia.';
  mode = mode || getMeetingMode();
  openDebateStage(currentDebateTopic, mode);
  dom.meetingLog.innerHTML = '';
  addMeetingSystem('Debate Stage berjalan. Advisor menjawab bergiliran; transcript penuh ada di overlay, summary dibuat setelah semua selesai.');
  dom.startMeetingBtn.disabled = true;
  dom.debateRetryBtn.disabled = true;
  dom.debateSaveBtn.disabled = true;
  dom.sendDecisionsToBoardBtn.disabled = true;
  dom.saveTranscriptBtn.disabled = true;

  const rows = DEBATE_AGENT_ORDER.map(id => ({ agent: getAgent(id), status: 'waiting', elapsedMs: 0 }));
  const outputs = [];
  const transcript = [{ type: 'system', text: `Meeting dimulai: ${getMeetingModeConfig(mode).label}. Topic: ${currentDebateTopic}` }];
  lastMeetingOutputs = outputs;
  lastMeetingTranscript = transcript;
  renderAdvisorRail(rows);
  renderDebateTranscript(transcript);
  persistMeetingStage(rows, outputs, transcript, '', 'thinking');

  for (const row of rows) {
    row.status = 'thinking';
    row.startedAt = performance.now();
    renderAdvisorRail(rows);
    persistMeetingStage(rows, outputs, transcript, '', 'thinking');
    const prompt = buildMeetingAdvisorPrompt(row.agent, currentDebateTopic, mode, outputs);
    try {
      const answer = await withTimeout(askAdvisor(row.agent.id, prompt, state), 90000);
      row.status = 'done';
      row.elapsedMs = performance.now() - row.startedAt;
      const cleanAnswer = stripProviderLine(answer);
      outputs.push({ agent: row.agent, answer: cleanAnswer, mode, elapsedMs: row.elapsedMs });
      transcript.push({
        type: 'agent',
        agentId: row.agent.id,
        name: row.agent.name,
        role: row.agent.role,
        text: cleanAnswer,
        elapsedMs: row.elapsedMs,
        ts: new Date().toISOString()
      });
      addMeetingMessage(row.agent, cleanAnswer);
    } catch (err) {
      row.status = 'failed';
      row.elapsedMs = row.startedAt ? performance.now() - row.startedAt : 0;
      const message = `Gagal mengambil jawaban: ${err.message || 'timeout/backend error'}`;
      outputs.push({ agent: row.agent, answer: message, failed: true, mode, elapsedMs: row.elapsedMs });
      transcript.push({
        type: 'agent',
        failed: true,
        agentId: row.agent.id,
        name: row.agent.name,
        role: row.agent.role,
        text: message,
        elapsedMs: row.elapsedMs,
        ts: new Date().toISOString()
      });
      addMeetingSystem(`${row.agent.name} gagal, rapat lanjut ke advisor berikutnya.`);
    }
    renderAdvisorRail(rows);
    renderDebateTranscript(transcript);
    persistMeetingStage(rows, outputs, transcript, '', 'thinking');
  }

  lastMeetingOutputs = outputs;
  lastMeetingTranscript = transcript;
  setScribeStatus('thinking', 'LLM Scribe sedang menyusun synthesis akhir...');
  persistMeetingStage(rows, outputs, transcript, '', 'thinking');
  let final = '';
  let summaryStatus = 'done';
  try {
    final = await generateMeetingSummary(outputs.filter(item => !item.failed), currentDebateTopic, mode);
    setScribeStatus('done', 'LLM Scribe selesai. Summary siap dipakai untuk keputusan.');
  } catch (err) {
    final = summarizeMeetingFallback(outputs, currentDebateTopic, mode);
    summaryStatus = 'fallback';
    setScribeStatus('fallback', `LLM Scribe gagal (${err.message || 'backend error'}). Fallback lokal dipakai.`);
  }
  dom.debateStageSummary.innerHTML = renderRichText(final);
  transcript.push({ type: 'system', text: `Summary selesai (${summaryStatus}).` });
  renderDebateTranscript(transcript);
  addMeetingSystem('Summary rapat siap di Debate Stage.');
  persistMeetingStage(rows, outputs, transcript, final, summaryStatus);
  dom.startMeetingBtn.disabled = false;
  dom.debateRetryBtn.disabled = false;
  dom.debateSaveBtn.disabled = false;
  dom.sendDecisionsToBoardBtn.disabled = false;
  dom.saveTranscriptBtn.disabled = false;
}

function getMeetingMode() {
  return dom.meetingModeSelect?.value || state.meetingStageState?.mode || 'strategy';
}

function getMeetingModeConfig(mode) {
  return MEETING_MODES[mode] || MEETING_MODES.strategy;
}

function buildMeetingAdvisorPrompt(agent, topic, mode, previousOutputs = []) {
  const modeConfig = getMeetingModeConfig(mode);
  const previous = previousOutputs.length
    ? previousOutputs.map(item => `${item.agent?.name}: ${String(item.answer || '').slice(0, 520)}`).join('\n---\n')
    : 'Belum ada advisor sebelumnya.';
  return [
    `Mode meeting: ${modeConfig.label}`,
    `Fokus mode: ${modeConfig.focus}`,
    `Topik rapat: ${topic}`,
    `Peran kamu: ${agent.name} - ${agent.role}`,
    `Instruksi peran: ${modeConfig.advisorInstruction}`,
    '',
    'Jawab dalam Bahasa Indonesia. Jangan generik. Berikan 3-5 poin yang bisa dipakai untuk keputusan Kaggle.',
    'Jika metadata/data tidak tersedia, katakan belum tersedia. Jangan menebak ukuran dataset, metric, atau deadline.',
    'Akhiri dengan satu rekomendasi aksi paling konkret dari perspektifmu.',
    '',
    `Jawaban advisor sebelumnya untuk konteks:\n${previous}`
  ].join('\n');
}

async function generateMeetingSummary(outputs, topic, mode) {
  const fallback = summarizeMeetingFallback(outputs, topic, mode);
  if (!outputs.length) return fallback;
  const modeConfig = getMeetingModeConfig(mode);
  const transcript = outputs.map(item => {
    const source = `${item.agent?.name || 'Advisor'} - ${item.agent?.role || 'Role unknown'}`;
    return `SOURCE: ${source}\n${String(item.answer || '').trim()}`;
  }).join('\n\n---\n\n');
  const prompt = [
    'Anda adalah LLM Scribe / moderator rapat Kaggle War Room.',
    'Tugas: sintesis diskusi multi-advisor menjadi summary keputusan yang singkat, akurat, dan actionable.',
    'Bahasa output: Indonesia.',
    'Aturan penting:',
    '- Jangan mengarang metric, deadline, ukuran dataset, atau fakta data yang tidak disebut transcript/context.',
    '- Setiap insight penting harus menyebut sumber advisor, contoh: Raka + Nadia atau Maya.',
    '- Jangan menyalin semua transcript. Gabungkan perbedaan pendapat menjadi keputusan.',
    '- Jika ada konflik pendapat, tulis di Risks & Objections.',
    '',
    `Mode meeting: ${modeConfig.label}`,
    `Fokus mode: ${modeConfig.focus}`,
    `Topik: ${topic}`,
    '',
    'Gunakan format heading persis ini:',
    '## Executive Summary',
    '## Key Decisions',
    '## Most Valuable Insights',
    '## Risks & Objections',
    '## Next Experiments',
    '## Open Questions',
    '## Recommended Next Meeting',
    '',
    `Transcript advisor:\n${transcript}`
  ].join('\n');
  const answer = stripProviderLine(await withTimeout(askAdvisor('maya-pm', prompt, {
    ...state,
    meetingStageState: { ...(state.meetingStageState || {}), topic, mode, outputs }
  }), 90000));
  return ensureScribeSections(answer, fallback);
}

function ensureScribeSections(answer, fallback) {
  const required = ['Executive Summary', 'Key Decisions', 'Most Valuable Insights', 'Risks & Objections', 'Next Experiments', 'Open Questions', 'Recommended Next Meeting'];
  const count = required.filter(title => new RegExp(`(^|\\n)#{1,3}\\s*${escapeRegExp(title)}`, 'i').test(answer)).length;
  if (count < 4) return fallback;
  const missing = required.filter(title => !new RegExp(`(^|\\n)#{1,3}\\s*${escapeRegExp(title)}`, 'i').test(answer));
  if (!missing.length) return answer;
  const fallbackSections = splitSummarySections(fallback);
  return `${answer.trim()}\n\n${missing.map(title => `## ${title}\n${fallbackSections[title] || '- Belum ada detail tambahan.'}`).join('\n\n')}`;
}

function splitSummarySections(text) {
  const sections = {};
  const parts = String(text || '').split(/\n(?=##\s+)/);
  for (const part of parts) {
    const match = part.match(/^##\s+(.+?)\n([\s\S]*)$/);
    if (match) sections[match[1].trim()] = match[2].trim();
  }
  return sections;
}

function renderAdvisorRail(rows) {
  dom.debateAdvisorRail.innerHTML = rows.map(row => `
    <article class="debateAdvisorItem ${escapeText(row.status)}">
      <div>
        <strong>${escapeText(row.agent.name)}</strong>
        <span class="role">${escapeText(row.agent.role)}</span>
      </div>
      <div class="advisorMeta">
        <span class="statusPill">${escapeText(meetingStatusLabel(row.status))}</span>
        <span class="elapsedTime">${formatElapsed(row.elapsedMs)}</span>
      </div>
    </article>
  `).join('');
}

function renderDebateTranscript(items = []) {
  if (!items.length) {
    dom.debateTranscript.innerHTML = '<div class="transcriptEmpty">Transcript belum tersedia. Mulai rapat untuk melihat jawaban advisor secara real-time.</div>';
    return;
  }
  dom.debateTranscript.innerHTML = items.map(item => {
    if (item.type === 'system') {
      return `<article class="transcriptMessage system"><p>${escapeText(item.text)}</p></article>`;
    }
    return `<article class="transcriptMessage agent ${item.failed ? 'failed' : ''}">
      <div class="transcriptMeta">
        <strong>${escapeText(item.name || 'Advisor')}</strong>
        <span class="dotSep">-</span>
        <span>${escapeText(item.role || '')}</span>
        <span class="dotSep">-</span>
        <span>${formatElapsed(item.elapsedMs)}</span>
      </div>
      <div class="richText">${item.failed ? escapeHtml(item.text || '') : renderRichText(stripProviderLine(item.text || ''))}</div>
    </article>`;
  }).join('');
  dom.debateTranscript.scrollTop = dom.debateTranscript.scrollHeight;
}

function setScribeStatus(status, message) {
  dom.debateSummaryStatus.className = `scribeStatus ${status}`;
  dom.debateSummaryStatus.textContent = message;
}

function persistMeetingStage(rows, outputs, transcript, summary, summaryStatus) {
  state.meetingStageState = {
    ...(state.meetingStageState || {}),
    active: true,
    topic: currentDebateTopic,
    mode: getMeetingMode(),
    statusByAgent: Object.fromEntries(rows.map(row => [row.agent.id, row.status])),
    outputs,
    transcript,
    summary: summary || state.meetingStageState?.summary || '',
    summaryStatus: summaryStatus || state.meetingStageState?.summaryStatus || 'idle',
    savedDecisions: Boolean(state.meetingStageState?.savedDecisions)
  };
  saveStatePatch({ meetingStageState: state.meetingStageState });
}

function meetingStatusLabel(status) {
  return ({ waiting: 'waiting', thinking: 'thinking', done: 'done', failed: 'failed' })[status] || status;
}

function formatElapsed(ms = 0) {
  if (!ms) return '--';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function saveDebateSummary() {
  const summaryText = dom.debateStageSummary.textContent.trim();
  if (!summaryText || summaryText === 'Belum ada summary.') {
    toast('Belum ada summary untuk disimpan.');
    return;
  }
  state.whiteboard = `${state.whiteboard || dom.whiteboardText.value}\n\nWAR ROOM SCRIBE SUMMARY\n${new Date().toLocaleString()}\nTopic: ${currentDebateTopic}\n\n${summaryText}`;
  dom.whiteboardText.value = state.whiteboard;
  state.experimentLog = [...(state.experimentLog || []), {
    name: `War Room decision - ${currentDebateTopic.slice(0, 54)}`,
    score: 'scribe summary saved',
    ts: new Date().toISOString()
  }];
  state.meetingStageState = { ...(state.meetingStageState || {}), savedDecisions: true, summary: summaryText };
  state.officeAliveState = { ...(state.officeAliveState || {}), strategyLight: 'done' };
  saveStatePatch({ whiteboard: state.whiteboard, experimentLog: state.experimentLog, meetingStageState: state.meetingStageState, officeAliveState: state.officeAliveState });
  world.setStrategyLight?.('done');
  renderExperimentLog();
  toast('Decisions disimpan ke whiteboard dan experiment log.');
}

function sendDebateDecisionsToBoard() {
  const summaryText = dom.debateStageSummary.textContent.trim();
  if (!summaryText || summaryText === 'Belum ada summary.') {
    toast('Belum ada summary untuk dikirim ke board.');
    return;
  }
  const decisions = extractSummarySection(summaryText, 'Key Decisions');
  const experiments = extractSummarySection(summaryText, 'Next Experiments');
  const payload = [
    'WAR ROOM NEXT ACTIONS',
    new Date().toLocaleString(),
    `Topic: ${currentDebateTopic}`,
    '',
    'Key Decisions:',
    decisions || '- Belum ada keputusan yang terstruktur.',
    '',
    'Next Experiments:',
    experiments || '- Belum ada eksperimen lanjutan yang terstruktur.'
  ].join('\n');
  state.whiteboard = `${state.whiteboard || dom.whiteboardText.value}\n\n${payload}`;
  dom.whiteboardText.value = state.whiteboard;
  state.experimentLog = [...(state.experimentLog || []), {
    name: `Next experiments - ${currentDebateTopic.slice(0, 50)}`,
    score: 'sent from Debate Stage',
    ts: new Date().toISOString()
  }];
  saveStatePatch({ whiteboard: state.whiteboard, experimentLog: state.experimentLog });
  renderExperimentLog();
  toast('Next experiments dikirim ke board.');
}

function saveDebateTranscript() {
  if (!lastMeetingTranscript.length) {
    toast('Transcript belum tersedia.');
    return;
  }
  state.meetingStageState = {
    ...(state.meetingStageState || {}),
    transcript: lastMeetingTranscript,
    transcriptSavedAt: new Date().toISOString()
  };
  saveStatePatch({ meetingStageState: state.meetingStageState });
  toast('Full transcript tersimpan di local state rapat.');
}

function extractSummarySection(text, title) {
  const source = String(text || '');
  const re = new RegExp(`${escapeRegExp(title)}\\s*([\\s\\S]*?)(?=Executive Summary|Key Decisions|Most Valuable Insights|Risks & Objections|Next Experiments|Open Questions|Recommended Next Meeting|$)`, 'i');
  const match = source.match(re);
  return match ? match[1].trim() : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toggleTeamGathering() {
  if (state.teamGathered) {
    world.dismissTeam();
    state.teamGathered = false;
    state.officeAliveState = { ...(state.officeAliveState || {}), strategyLight: 'idle' };
    world.setStrategyLight?.('idle');
    saveStatePatch({ teamGathered: false, officeAliveState: state.officeAliveState });
    updateTeamButton();
    toast('Team kembali ke ruangan masing-masing.');
    return;
  }
  ensureTeamGathered();
  world.teleportToWarRoom();
  addMeetingSystem('Team sudah berada di War Room. Tulis topik rapat lalu mulai debat.');
}

function ensureTeamGathered() {
  if (!state.teamGathered) {
    world.gatherTeam();
    state.teamGathered = true;
    state.officeAliveState = { ...(state.officeAliveState || {}), strategyLight: 'meeting' };
    world.setStrategyLight?.('meeting');
    saveStatePatch({ teamGathered: true, officeAliveState: state.officeAliveState });
    updateTeamButton();
  }
}

function updateTeamButton() {
  dom.gatherTeamBtn.textContent = state.teamGathered ? 'Bubarkan team' : 'Kumpulkan team';
  updateNpcStatus();
}

function updateNpcStatus() {
  if (!dom.npcStatus) return;
  if (state.focusMode) dom.npcStatus.textContent = 'Coworker diam karena Focus Mode aktif.';
  else if (state.teamGathered) dom.npcStatus.textContent = 'Coworker diam karena team sedang dikumpulkan di War Room.';
  else if (!state.npcBehaviorEnabled) dom.npcStatus.textContent = 'Coworker wandering sedang dimatikan.';
  else dom.npcStatus.textContent = 'Coworker akan jalan santai di ruangan masing-masing.';
}

function handleInteraction(meta) {
  if (!meta) return;
  if (meta.type === 'agent') {
    world.unlock();
    openConversation(meta.agentId || meta.id);
    return;
  }
  if (meta.type === 'whiteboard') {
    world.unlock();
    renderKanban();
    dom.whiteboardDialog.showModal();
    return;
  }
  if (meta.type === 'onboarding') {
    world.unlock();
    renderOnboarding();
    dom.onboardingDialog.showModal();
    return;
  }
  if (meta.type === 'meeting') {
    world.unlock();
    togglePanel(true);
    showPane('meeting');
    dom.meetingTopic.focus();
    addMeetingSystem('Anda berada di Meeting Table. Tulis topik rapat, lalu mulai debat team.');
    return;
  }
  if (meta.type === 'llm') {
    world.unlock();
    togglePanel(true);
    showPane('settings');
    dom.llmEndpoint.focus();
    return;
  }
  if (meta.type === 'elevator') {
    toast('Lift sekarang memakai tombol fisik. Masuk ke kabin lalu tekan E pada F1/F2/F3.');
    return;
  }
  if (meta.type === 'elevator-door') {
    world.enterElevator();
    toast('Pintu lift terbuka. Masuk dan tekan tombol lantai di panel kanan.');
    return;
  }
  if (meta.type === 'elevator-button') {
    world.requestLiftRide(meta.targetFloor);
    return;
  }
  if (meta.type === 'quiz' || meta.type === 'arcade-game') {
    world.unlock();
    openArcade(meta.gameId || 'quiz');
    return;
  }
  if (meta.type === 'recharge') {
    world.unlock();
    togglePanel(true);
    showPane('settings');
    if (!state.audioSettings?.musicEnabled) {
      dom.musicToggle.checked = true;
      updateAudioSetting('musicEnabled', true);
    }
    toast('Recharge mode: relax music siap. Ambil napas sebentar sebelum eksperimen berikutnya.');
    return;
  }
  if (meta.type === 'reflection') {
    world.unlock();
    renderKanban();
    dom.whiteboardDialog.showModal();
    toast('Reflection board dibuka untuk post-mortem dan lesson learned.');
    return;
  }
  if (meta.type === 'leaderboard') {
    world.unlock();
    addMeetingSystem('Leaderboard reminder: jangan submit berdasarkan public LB saja. Bandingkan CV, variance antar fold, dan audit format file sebelum submit.');
    togglePanel(true);
    showPane('meeting');
    return;
  }
  if (meta.type === 'coffee') {
    handleCoffeeInteraction(meta);
    return;
  }
  if (meta.type === 'desk-note') {
    handleDeskNote(meta);
    return;
  }
  if (meta.type === 'trophy-wall') {
    handleTrophyWall();
    return;
  }
  if (meta.type === 'room-directory') {
    handleRoomDirectory(meta.floor || activeFloor);
    return;
  }
  if (meta.type === 'focus-corner') {
    handleFocusCorner();
    return;
  }
  if (meta.type === 'strategy-light') {
    handleStrategyLight();
  }
}

function ensureOfficeAliveState() {
  state.officeAliveState = {
    coffeeBrews: 0,
    notesRead: [],
    focusCornerUses: 0,
    lastDirectoryFloor: activeFloor,
    strategyLight: 'idle',
    ...(state.officeAliveState || {})
  };
  if (!Array.isArray(state.officeAliveState.notesRead)) state.officeAliveState.notesRead = [];
  return state.officeAliveState;
}

async function handleCoffeeInteraction(meta) {
  const office = ensureOfficeAliveState();
  office.coffeeBrews += 1;
  saveStatePatch({ officeAliveState: office });
  world.startCoffeeSequence?.(meta.id);
  await audioManager.playCoffeeStart?.();
  window.setTimeout(() => audioManager.playCoffeePour?.(), 220);
  window.setTimeout(() => audioManager.playCoffeeSip?.(), 3150);
  showOfficeInteraction({
    kicker: 'Coffee Ritual',
    title: `${meta.label || 'Coffee'} sedang dibuat`,
    body: [
      'Mesin kopi mulai brewing. Gunakan jeda pendek ini untuk memilih satu next action, bukan membuka eksperimen baru tanpa arah.',
      '<div class="brewProgress"><span></span></div>'
    ].join(''),
    stats: [`Ritual #${office.coffeeBrews}`, state.focusMode ? 'Focus Mode on' : 'Focus Mode off'],
    actions: [
      { label: 'Buka Board', onClick: () => { togglePanel(true); showPane('board'); closeOfficeInteraction(); } },
      { label: 'Focus Mode', onClick: () => { if (!state.focusMode) toggleFocusMode(); } }
    ]
  });
  window.setTimeout(() => {
    showOfficeInteraction({
      kicker: 'Coffee Ready',
      title: 'Kopi siap. Sekarang kunci keputusan kecil.',
      body: 'Tulis satu hal: metric yang dicek, eksperimen berikutnya, atau risiko yang harus diaudit. Interaksi kecil seperti ini sengaja dibuat sebagai ritual kerja, bukan cuma dekor.',
      stats: [`Total coffee ${office.coffeeBrews}`, 'Focus +1'],
      actions: [
        { label: 'Catat next experiment', onClick: () => { togglePanel(true); showPane('board'); dom.experimentName.focus(); } },
        { label: 'Tutup', onClick: closeOfficeInteraction }
      ]
    });
  }, 3300);
  toast('Coffee brewing...');
  addMeetingSystem(`Coffee ritual #${office.coffeeBrews}: gunakan 2 menit untuk menulis next action eksperimen.`);
}

function handleDeskNote(meta) {
  const office = ensureOfficeAliveState();
  const noteId = meta.noteId || meta.id;
  if (!office.notesRead.includes(noteId)) office.notesRead.push(noteId);
  saveStatePatch({ officeAliveState: office });
  const note = officeNoteText(noteId);
  showOfficeInteraction({
    kicker: 'Desk Note',
    title: note.title,
    body: note.body,
    stats: [`Notes read ${office.notesRead.length}`, activeRoom],
    actions: [
      { label: 'Kirim ke board', onClick: () => {
        state.whiteboard = `${state.whiteboard || ''}\n\nDESK NOTE - ${note.title}\n${note.body}`;
        dom.whiteboardText.value = state.whiteboard;
        saveStatePatch({ whiteboard: state.whiteboard });
        toast('Desk note dikirim ke whiteboard.');
      } }
    ]
  });
  toast(note.title);
  addMeetingSystem(`${note.title}: ${note.body}`);
}

function handleTrophyWall() {
  const office = ensureOfficeAliveState();
  const games = state.learningProgress?.games || {};
  const runs = state.workspaceState?.runs?.length || 0;
  const summary = Object.entries(games)
    .map(([id, val]) => `${gameLabel(id)} best ${val?.bestScore ?? 0}`)
    .join(' | ');
  showOfficeInteraction({
    kicker: 'Achievement Wall',
    title: 'Progress kecil yang sudah terkumpul',
    body: summary || 'Belum ada skor game. Lantai 3 bisa dipakai untuk latihan ringan saat butuh jeda.',
    stats: [`Workspace runs ${runs}`, `Coffee ${office.coffeeBrews || 0}`],
    actions: [
      { label: 'Buka Floor 3 games', onClick: () => { closeOfficeInteraction(); openArcade('quiz'); } },
      { label: 'Buka Coding Studio', onClick: () => { togglePanel(true); showPane('coding'); closeOfficeInteraction(); } }
    ]
  });
  toast(`Achievement Wall dibuka.`);
  office.lastDirectoryFloor = activeFloor;
  saveStatePatch({ officeAliveState: office });
}

function handleRoomDirectory(floor = activeFloor) {
  const office = ensureOfficeAliveState();
  office.lastDirectoryFloor = floor;
  saveStatePatch({ officeAliveState: office });
  const names = ROOMS.filter(room => room.floor === floor).map(room => room.name).join(' / ');
  showOfficeInteraction({
    kicker: `F${floor} Directory`,
    title: 'Ruangan di lantai ini',
    body: names,
    stats: ['Dekat lift', 'Room purpose'],
    actions: [
      { label: 'Tutup', onClick: closeOfficeInteraction }
    ]
  });
  toast(`F${floor} Directory dibuka.`);
  renderMinimap();
}

function handleFocusCorner() {
  const office = ensureOfficeAliveState();
  office.focusCornerUses += 1;
  saveStatePatch({ officeAliveState: office });
  if (!state.focusMode) toggleFocusMode();
  world.unlock();
  togglePanel(true);
  showPane('coding');
  showOfficeInteraction({
    kicker: 'Focus Corner',
    title: 'Mode fokus aktif',
    body: 'NPC dibuat lebih tenang, audio diredam, dan Coding Studio dibuka. Pilih satu notebook/script, jalankan aman, lalu catat hasilnya.',
    stats: [`Focus uses ${office.focusCornerUses}`, 'Coding Studio'],
    actions: [
      { label: 'Buka Board', onClick: () => showPane('board') },
      { label: 'Scan workspace', onClick: () => scanWorkspace(false) }
    ]
  });
  toast('Focus Corner aktif.');
}

function handleStrategyLight() {
  const office = ensureOfficeAliveState();
  const mode = state.teamGathered ? 'meeting' : office.strategyLight || 'idle';
  world.setStrategyLight?.(mode);
  showOfficeInteraction({
    kicker: 'War Room Status',
    title: state.teamGathered ? 'Team sedang berkumpul' : 'War Room idle',
    body: state.teamGathered ? 'Lampu strategi menunjukkan meeting mode. Siapkan topik debat yang spesifik agar advisor tidak memberi jawaban generik.' : 'Kumpulkan team ketika sudah punya data, metric, atau eksperimen yang perlu diputuskan.',
    stats: [mode, activeRoom],
    actions: [
      { label: 'Meeting tab', onClick: () => { togglePanel(true); showPane('meeting'); } },
      { label: state.teamGathered ? 'Mulai debat' : 'Kumpulkan team', onClick: () => { if (!state.teamGathered) ensureTeamGathered(); togglePanel(true); showPane('meeting'); } }
    ]
  });
  toast(state.teamGathered ? 'Status War Room: meeting.' : 'Status War Room: idle.');
  togglePanel(true);
  showPane('meeting');
}

function showOfficeInteraction({ kicker = 'Office Interaction', title = 'Interaction', body = '', stats = [], actions = [] } = {}) {
  dom.officeInteractionKicker.textContent = kicker;
  dom.officeInteractionTitle.textContent = title;
  dom.officeInteractionBody.innerHTML = Array.isArray(body)
    ? body.map(item => `<p>${escapeHtml(item)}</p>`).join('')
    : String(body).includes('<div class="brewProgress"')
      ? String(body).split('<div class="brewProgress"').map((part, idx) => idx === 0 ? `<p>${escapeHtml(part)}</p>` : `<div class="brewProgress"${part}`).join('')
      : `<p>${escapeHtml(String(body))}</p>`;
  dom.officeInteractionStats.innerHTML = stats.map(item => `<span>${escapeHtml(String(item))}</span>`).join('');
  dom.officeInteractionActions.innerHTML = '';
  actions.forEach((action, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label || `Action ${idx + 1}`;
    if (idx === 0) btn.className = 'primaryBtn';
    btn.addEventListener('click', action.onClick || closeOfficeInteraction);
    dom.officeInteractionActions.appendChild(btn);
  });
  dom.officeInteractionOverlay.hidden = false;
}

function closeOfficeInteraction() {
  dom.officeInteractionOverlay.hidden = true;
}

function officeNoteText(noteId) {
  const notes = {
    'data-audit': {
      title: 'Data Lab Note',
      body: 'Jangan percaya shape saja. Catat tipe kolom, missing value, cardinality, duplicate, dan kolom yang hanya muncul di train/test.'
    },
    baseline: {
      title: 'Model Lab Note',
      body: 'Baseline yang baik itu sederhana, reproducible, punya seed tetap, dan menjadi pembanding sebelum eksperimen fitur/model.'
    },
    review: {
      title: 'Review Room Note',
      body: 'Sebelum submit: audit preprocessing per fold, urutan sample_submission, metric lokal, dan apakah CV-LB masuk akal.'
    }
  };
  return notes[noteId] || { title: 'Desk Note', body: 'Tulis hipotesis sebelum mengejar skor leaderboard.' };
}

function gameLabel(id) {
  return ({ quiz: 'Quiz', leakHunter: 'Leak Hunter', typingSprint: 'Typing Sprint', memoryMatch: 'Memory Match' })[id] || id;
}

function renderOnboarding() {
  const steps = onboardingSteps(state);
  dom.onboardingSteps.innerHTML = steps.map(s => `<li>${escapeHtml(s)}</li>`).join('');
}

function openArcade(gameId = 'quiz') {
  activeGameId = GAME_DEFS.some(game => game.id === gameId) ? gameId : 'quiz';
  dom.arcadeOverlay.hidden = false;
  resetGameState(activeGameId);
  renderArcade();
}

function closeArcade() {
  dom.arcadeOverlay.hidden = true;
}

function resetGameState(gameId) {
  if (gameId === 'quiz') gameState = { index: 0, score: 0, answered: false };
  if (gameId === 'leakHunter') gameState = { index: 0, score: 0, answered: false };
  if (gameId === 'typingSprint') gameState = { index: 0, score: 0, start: Date.now() };
  if (gameId === 'memoryMatch') {
    const cards = MEMORY_PAIRS.flatMap((pair, idx) => [
      { id: `${idx}-a`, pair: idx, text: pair[0], open: false, done: false },
      { id: `${idx}-b`, pair: idx, text: pair[1], open: false, done: false }
    ]).sort(() => Math.random() - 0.5);
    gameState = { cards, open: [], moves: 0, matches: 0 };
  }
}

function renderArcade() {
  const game = GAME_DEFS.find(item => item.id === activeGameId) || GAME_DEFS[0];
  dom.arcadeTitle.textContent = game.title;
  dom.arcadeSubtitle.textContent = game.subtitle;
  dom.arcadeGameTabs.innerHTML = GAME_DEFS.map(item => `<button class="${item.id === activeGameId ? 'active' : ''}" data-game-tab="${item.id}">${escapeText(item.title)}</button>`).join('');
  dom.arcadeGameTabs.querySelectorAll('[data-game-tab]').forEach(btn => btn.addEventListener('click', () => openArcade(btn.dataset.gameTab)));
  if (activeGameId === 'quiz') renderQuizGame();
  if (activeGameId === 'leakHunter') renderLeakHunterGame();
  if (activeGameId === 'typingSprint') renderTypingSprintGame();
  if (activeGameId === 'memoryMatch') renderMemoryMatchGame();
}

function renderQuizGame() {
  const item = QUIZ_QUESTIONS[gameState.index];
  if (!item) return finishGame('quiz', gameState.score, QUIZ_QUESTIONS.length, QUIZ_QUESTIONS.map(q => q.concept));
  dom.arcadeContent.innerHTML = `
    <div class="gameQuestion">
      <span>Question ${gameState.index + 1}/${QUIZ_QUESTIONS.length}</span>
      <h3>${escapeText(item.question)}</h3>
      <div class="gameOptions">
        ${item.options.map((option, idx) => `<button data-quiz-option="${idx}">${escapeText(option)}</button>`).join('')}
      </div>
      <p class="hint">Concept: ${escapeText(item.concept)}</p>
    </div>
  `;
  dom.arcadeContent.querySelectorAll('[data-quiz-option]').forEach(btn => btn.addEventListener('click', () => answerArcadeQuestion(Number(btn.dataset.quizOption), item, 'quiz')));
}

function answerArcadeQuestion(choice, item, gameId) {
  if (gameState.answered) return;
  gameState.answered = true;
  const correct = choice === item.answer;
  if (correct) gameState.score += 1;
  dom.arcadeContent.querySelectorAll('[data-quiz-option],[data-leak-option]').forEach(btn => {
    const value = Number(btn.dataset.quizOption ?? btn.dataset.leakOption);
    btn.classList.toggle('correct', value === item.answer);
    btn.classList.toggle('incorrect', value === choice && !correct);
    btn.disabled = true;
  });
  dom.arcadeContent.insertAdjacentHTML('beforeend', `
    <div class="gameFeedback ${correct ? 'correct' : 'incorrect'}">
      <strong>${correct ? 'Benar' : 'Belum tepat'}</strong>
      <p>${escapeText(item.explanation || `Review: ${item.concept}`)}</p>
      <button id="nextGameQuestionBtn" class="primaryBtn" type="button">Lanjut</button>
    </div>
  `);
  $('#nextGameQuestionBtn').addEventListener('click', () => {
    gameState.index += 1;
    gameState.answered = false;
    gameId === 'quiz' ? renderQuizGame() : renderLeakHunterGame();
  });
}

function renderLeakHunterGame() {
  const item = LEAK_HUNTER_SCENARIOS[gameState.index];
  if (!item) return finishGame('leakHunter', gameState.score, LEAK_HUNTER_SCENARIOS.length, LEAK_HUNTER_SCENARIOS.map(q => q.concept));
  dom.arcadeContent.innerHTML = `
    <div class="gameQuestion">
      <span>Scenario ${gameState.index + 1}/${LEAK_HUNTER_SCENARIOS.length}</span>
      <h3>${escapeText(item.prompt)}</h3>
      <p class="hint">Pilih kolom yang paling berisiko leakage.</p>
      <div class="gameOptions">
        ${item.columns.map((option, idx) => `<button data-leak-option="${idx}">${escapeText(option)}</button>`).join('')}
      </div>
    </div>
  `;
  dom.arcadeContent.querySelectorAll('[data-leak-option]').forEach(btn => btn.addEventListener('click', () => answerArcadeQuestion(Number(btn.dataset.leakOption), item, 'leakHunter')));
}

function renderTypingSprintGame() {
  const prompt = TYPING_PROMPTS[gameState.index];
  if (!prompt) {
    const elapsed = Math.max(1, Math.round((Date.now() - gameState.start) / 1000));
    return finishGame('typingSprint', gameState.score, TYPING_PROMPTS.length, ['Commands', 'Focus', 'Submission'], `${elapsed}s`);
  }
  dom.arcadeContent.innerHTML = `
    <div class="gameQuestion">
      <span>Prompt ${gameState.index + 1}/${TYPING_PROMPTS.length}</span>
      <h3 class="typingPrompt">${escapeText(prompt)}</h3>
      <input id="typingSprintInput" class="gameInput" autocomplete="off" placeholder="Ketik ulang di sini" />
      <div class="buttonGrid two">
        <button id="typingSprintSubmit" class="primaryBtn" type="button">Cek</button>
        <button id="typingSprintSkip" type="button">Skip</button>
      </div>
    </div>
  `;
  $('#typingSprintInput').focus();
  $('#typingSprintSubmit').addEventListener('click', answerTypingSprint);
  $('#typingSprintInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') answerTypingSprint();
  });
  $('#typingSprintSkip').addEventListener('click', () => {
    gameState.index += 1;
    renderTypingSprintGame();
  });
}

function answerTypingSprint() {
  const value = $('#typingSprintInput').value.trim().replace(/\s+/g, ' ').toLowerCase();
  const target = TYPING_PROMPTS[gameState.index].toLowerCase();
  const correct = value === target;
  if (correct) gameState.score += 1;
  dom.arcadeContent.insertAdjacentHTML('beforeend', `
    <div class="gameFeedback ${correct ? 'correct' : 'incorrect'}">
      <strong>${correct ? 'Perfect' : 'Typo terdeteksi'}</strong>
      <p>${correct ? 'Command/konsep sudah presisi.' : `Target: ${escapeText(TYPING_PROMPTS[gameState.index])}`}</p>
      <button id="nextTypingBtn" class="primaryBtn" type="button">Lanjut</button>
    </div>
  `);
  $('#typingSprintSubmit').disabled = true;
  $('#nextTypingBtn').addEventListener('click', () => {
    gameState.index += 1;
    renderTypingSprintGame();
  });
}

function renderMemoryMatchGame() {
  if (gameState.matches >= MEMORY_PAIRS.length) {
    const score = Math.max(1, MEMORY_PAIRS.length * 2 - gameState.moves);
    return finishGame('memoryMatch', score, MEMORY_PAIRS.length * 2, ['Metric terms', 'ML vocabulary']);
  }
  dom.arcadeContent.innerHTML = `
    <div class="gameQuestion">
      <span>Moves: ${gameState.moves}</span>
      <h3>Cocokkan istilah dengan artinya.</h3>
      <div class="memoryGrid">
        ${gameState.cards.map(card => `<button class="memoryCard ${card.open || card.done ? 'open' : ''} ${card.done ? 'matched' : ''}" data-card-id="${card.id}">${card.open || card.done ? escapeText(card.text) : '?'}</button>`).join('')}
      </div>
    </div>
  `;
  dom.arcadeContent.querySelectorAll('[data-card-id]').forEach(btn => btn.addEventListener('click', () => flipMemoryCard(btn.dataset.cardId)));
}

function flipMemoryCard(cardId) {
  const card = gameState.cards.find(item => item.id === cardId);
  if (!card || card.done || card.open || gameState.open.length >= 2) return;
  card.open = true;
  gameState.open.push(card);
  if (gameState.open.length === 2) {
    gameState.moves += 1;
    const [a, b] = gameState.open;
    if (a.pair === b.pair) {
      a.done = true;
      b.done = true;
      gameState.matches += 1;
      gameState.open = [];
      renderMemoryMatchGame();
    } else {
      renderMemoryMatchGame();
      setTimeout(() => {
        a.open = false;
        b.open = false;
        gameState.open = [];
        renderMemoryMatchGame();
      }, 650);
      return;
    }
  }
  renderMemoryMatchGame();
}

function finishGame(gameId, score, maxScore, concepts, extra = '') {
  const game = GAME_DEFS.find(item => item.id === gameId);
  saveGameProgress(gameId, score, concepts);
  const progress = state.learningProgress?.games?.[gameId] || { runs: 0, bestScore: 0 };
  dom.arcadeContent.innerHTML = `
    <div class="gameResult">
      <strong>${escapeText(game.title)} selesai</strong>
      <p>Score: ${score}/${maxScore}${extra ? ` - ${escapeText(extra)}` : ''}</p>
      <p>Best score: ${progress.bestScore}</p>
      <p>Concepts to review: ${concepts.map(escapeText).join(', ')}</p>
      <div class="buttonGrid two">
        <button id="restartGameBtn" class="primaryBtn" type="button">Main lagi</button>
        <button id="nextGameBtn" type="button">Game berikutnya</button>
      </div>
    </div>
  `;
  $('#restartGameBtn').addEventListener('click', () => openArcade(gameId));
  $('#nextGameBtn').addEventListener('click', () => {
    const idx = GAME_DEFS.findIndex(item => item.id === gameId);
    openArcade(GAME_DEFS[(idx + 1) % GAME_DEFS.length].id);
  });
}

function saveGameProgress(gameId, score, concepts = []) {
  const learning = state.learningProgress || {};
  const games = { ...(learning.games || {}) };
  const prev = games[gameId] || { runs: 0, bestScore: 0 };
  games[gameId] = { runs: (prev.runs || 0) + 1, bestScore: Math.max(prev.bestScore || 0, score) };
  state.learningProgress = {
    ...learning,
    quizRuns: gameId === 'quiz' ? (learning.quizRuns || 0) + 1 : (learning.quizRuns || 0),
    bestScore: gameId === 'quiz' ? Math.max(learning.bestScore || 0, score) : (learning.bestScore || 0),
    reviewedConcepts: [...new Set([...(learning.reviewedConcepts || []), ...concepts])],
    games
  };
  saveStatePatch({ learningProgress: state.learningProgress });
}

function updateMode(locked) {
  dom.modePill.textContent = locked ? 'Mode First-person' : 'Mode UI';
  dom.enterWorldBtn.textContent = locked ? 'Sedang first-person' : 'Masuk mode first-person';
}

function updateVoiceUI() {
  state.voiceEnabled = false;
  state.audioSettings = { ...(state.audioSettings || {}), voiceEnabled: false };
  saveStatePatch({ voiceEnabled: false, audioSettings: state.audioSettings });
  window.speechSynthesis?.cancel?.();
  dom.voicePill.textContent = 'Voice: Off';
  dom.voiceToggleBtn.textContent = 'Voice coworker: Off';
  dom.voiceToggleBtn.disabled = true;
}

function togglePanel(force) {
  const open = typeof force === 'boolean' ? force : !dom.sidePanel.classList.contains('open');
  dom.sidePanel.classList.toggle('open', open);
  dom.panelEdgeTab.textContent = open ? 'Tutup' : 'Panel';
  dom.togglePanelBtn.title = open ? 'Tutup panel' : 'Buka panel';
}

function addUserChat(message) {
  const node = document.createElement('div');
  node.className = 'message user';
  node.textContent = message;
  dom.chatLog.appendChild(node);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

function addAgentChat(agent, message) {
  const node = document.createElement('div');
  node.className = 'message agent';
  node.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${escapeHtml(message)}`;
  dom.chatLog.appendChild(node);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
  return node;
}

function addSystemChat(message) {
  const node = document.createElement('div');
  node.className = 'message system';
  node.textContent = message;
  dom.chatLog.appendChild(node);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

function addMeetingSystem(message) {
  const node = document.createElement('div');
  node.className = 'message system';
  node.textContent = message;
  dom.meetingLog.appendChild(node);
  dom.meetingLog.scrollTop = dom.meetingLog.scrollHeight;
}

function addMeetingMessage(agent, message) {
  const node = document.createElement('div');
  node.className = 'message agent';
  node.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${renderRichText(message)}`;
  dom.meetingLog.appendChild(node);
  dom.meetingLog.scrollTop = dom.meetingLog.scrollHeight;
}

function openRpgDialog(agentId) {
  const agent = getAgent(agentId);
  activeAgentId = agent.id;
  dom.agentSelect.value = agent.id;
  dom.rpgName.textContent = `${agent.name} - ${agent.role}`;
  dom.rpgText.textContent = agent.opener;
  renderRpgChoices(agent);
  dom.rpgDialog.hidden = false;
  dom.interactionHint.textContent = 'Dialog RPG aktif. Pilih opsi di bawah atau buka Mission Control untuk chat bebas.';
}

function closeRpgDialog() {
  dom.rpgDialog.hidden = true;
}

function renderRpgChoices(agent) {
  const choices = [
    ['Jelaskan project ini', 'Jelaskan project Kaggle aktif secara singkat: tujuan, metric/data yang sudah diketahui, risiko, dan langkah berikutnya.'],
    ['Saran eksperimen', 'Berikan 3 eksperimen Kaggle berikutnya yang paling masuk akal dan murah diuji dari state project saat ini.'],
    ['Cek risiko', 'Audit risiko terbesar sebelum submission: validasi, leakage, data, dan format submission.'],
    ['Chat bebas di desk', null]
  ];
  dom.rpgChoices.innerHTML = choices.map(([label], idx) => `<button type="button" data-rpg-choice="${idx}">${label}</button>`).join('');
  dom.rpgChoices.querySelectorAll('[data-rpg-choice]').forEach((btn) => {
    const idx = Number(btn.dataset.rpgChoice);
    const [label, prompt] = choices[idx];
    btn.addEventListener('click', () => {
      if (!prompt) {
        closeRpgDialog();
        openConversation(agent.id);
        toast('Fullscreen conversation dibuka.');
        return;
      }
      askRpgChoice(agent, label, prompt);
    });
  });
}

async function askRpgChoice(agent, label, prompt) {
  dom.rpgText.textContent = `${label}\n\n${agent.name} sedang menyusun jawaban...`;
  addUserChat(`[RPG] ${label}`);
  const thinking = addAgentChat(agent, 'Sedang menyusun jawaban dari dialog RPG...');
  try {
    const answer = await askAdvisor(agent.id, prompt, state);
    thinking.textContent = '';
    thinking.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>${escapeHtml(answer)}`;
    dom.rpgText.textContent = answer;
  } catch {
    dom.rpgText.textContent = 'Maaf, dialog RPG gagal menghubungi backend/chat. Cek backend LLM di Settings.';
    thinking.textContent = '';
    thinking.innerHTML = `<strong>${agent.name} - ${agent.role}</strong>Maaf, dialog RPG gagal memproses jawaban.`;
  }
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => dom.toast.classList.remove('show'), 2600);
}

function stripProviderLine(value) {
  return String(value || '').replace(/^\[(LLM|Backend fallback|Frontend fallback):[^\]]+\]\s*/i, '').trim();
}

function renderRichText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '<p></p>';
  const lines = raw.split(/\r?\n/);
  const html = [];
  let listType = '';
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = '';
    }
  };
  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const provider = line.match(/^\[(LLM|Backend fallback|Frontend fallback):(.+)\]$/i);
    if (provider) {
      closeList();
      html.push(`<span class="providerBadge">${escapeText(line)}</span>`);
      continue;
    }
    const heading = line.match(/^\*\*(.+?)\*\*:?\s*$/) || line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h3>${inlineFormat(heading[1])}</h3>`);
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inlineFormat(numbered[2])}</li>`);
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inlineFormat(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineFormat(line)}</p>`);
  }
  closeList();
  return html.join('');
}

function inlineFormat(value) {
  return escapeText(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeHtml(value) {
  return escapeText(value)
    .replaceAll('\n', '<br/>');
}
