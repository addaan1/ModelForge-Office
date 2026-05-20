import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCompetitionSlug,
  defaultProjectState,
  buildAdvisorContext,
  applyAnalyzeResult,
  buildKanbanItems,
  normalizeBackendModelId
} from './advisors.js';

test('extractCompetitionSlug accepts Kaggle competition URLs and plain slugs', () => {
  assert.equal(
    extractCompetitionSlug('https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques/overview'),
    'house-prices-advanced-regression-techniques'
  );
  assert.equal(extractCompetitionSlug('titanic'), 'titanic');
});

test('defaultProjectState exposes v2.7 operating state', () => {
  const state = defaultProjectState();

  assert.deepEqual(state.kaggleMetadata, {});
  assert.equal(state.downloadStatus.status, 'idle');
  assert.equal(state.teamGathered, false);
  assert.equal(state.seatMode.active, false);
  assert.equal(state.transcriptDraft, '');
  assert.deepEqual(state.experimentLog, []);
  assert.equal(state.llmEndpoint, 'http://127.0.0.1:7860/api/chat');
  assert.equal(state.audioSettings.musicEnabled, false);
  assert.equal(state.audioSettings.ambienceEnabled, false);
  assert.equal(state.audioSettings.voiceEnabled, false);
  assert.equal(state.npcBehaviorEnabled, true);
  assert.equal(state.focusMode, false);
  assert.equal(state.collisionDebugEnabled, false);
  assert.equal(state.currentFloor, 1);
  assert.equal(state.lookSensitivity, 0.96);
  assert.equal(state.learningProgress.quizRuns, 0);
  assert.deepEqual(state.workspaceState.code_files, []);
  assert.equal(state.missionRouter.mode, 'fast');
  assert.equal(state.conversationState.active, false);
  assert.equal(state.conversationState.agentId, 'maya-pm');
  assert.equal(state.meetingStageState.active, false);
  assert.equal(state.officeAliveState.coffeeBrews, 0);
  assert.deepEqual(state.officeAliveState.notesRead, []);
  assert.equal(state.officeAliveState.strategyLight, 'idle');
  assert.equal(state.learningProgress.games.quiz.runs, 0);
  assert.equal(state.learningProgress.games.leakHunter.bestScore, 0);
});

test('applyAnalyzeResult stores Kaggle metadata and marks download complete', () => {
  const state = defaultProjectState();
  const next = applyAnalyzeResult(state, {
    slug: 'titanic',
    files: [{ name: 'train.csv', size: '64KB' }],
    download_path: 'data/competitions/titanic/raw',
    metadata: { source: 'kaggle-cli' },
    data_profile: { tables: [{ name: 'train.csv', rows: 891 }] },
    warnings: []
  });

  assert.equal(next.currentProject.slug, 'titanic');
  assert.equal(next.downloadStatus.status, 'complete');
  assert.equal(next.kaggleMetadata.files[0].name, 'train.csv');
  assert.equal(next.kaggleMetadata.data_profile.tables[0].rows, 891);
});

test('applyAnalyzeResult uses local profile files when Kaggle file list is empty', () => {
  const state = defaultProjectState();
  const next = applyAnalyzeResult(state, {
    slug: 'playground-series-s6e5',
    files: [],
    download_path: 'data/competitions/playground-series-s6e5/raw',
    metadata: { files_source: 'local_raw_profile' },
    data_profile: {
      files: [{ name: 'train.csv' }, { name: 'test.csv' }],
      tables: [{ name: 'train.csv', rows: 750000, columns: ['id', 'target'] }]
    },
    warnings: []
  });

  assert.equal(next.kaggleMetadata.files[0].name, 'train.csv');
  assert.equal(next.kaggleMetadata.data_profile.tables[0].rows, 750000);
});

test('buildAdvisorContext includes metadata, board, experiments, and meeting context', () => {
  const state = applyAnalyzeResult(defaultProjectState(), {
    slug: 'titanic',
    files: [{ name: 'train.csv' }],
    download_path: 'data/competitions/titanic/raw',
    metadata: { source: 'test' },
    data_profile: { tables: [] },
    warnings: ['Kaggle CLI unavailable']
  });
  state.whiteboard = 'Decision: validate before leaderboard';
  state.experimentLog = [{ name: 'baseline', cv: '0.82' }];

  const context = buildAdvisorContext(state, [{ agent: { role: 'PM' }, answer: 'Start with intake.' }]);

  assert.equal(context.kaggle_metadata.slug, 'titanic');
  assert.equal(context.whiteboard, 'Decision: validate before leaderboard');
  assert.equal(context.experiment_log[0].name, 'baseline');
  assert.equal(context.meeting_context[0].role, 'PM');
});

test('buildKanbanItems uses real downloaded file names when available', () => {
  const state = applyAnalyzeResult(defaultProjectState(), {
    slug: 'titanic',
    files: [{ name: 'train.csv' }, { name: 'sample_submission.csv' }],
    download_path: 'data/competitions/titanic/raw',
    metadata: {},
    data_profile: { tables: [{ name: 'train.csv', rows: 891 }] },
    warnings: []
  });

  const kanban = buildKanbanItems(state);

  assert.ok(kanban.Todo.some((item) => item.includes('train.csv')));
  assert.ok(kanban.Review.some((item) => item.includes('sample_submission.csv')));
});

test('normalizeBackendModelId converts display labels to runnable local ids', () => {
  assert.equal(normalizeBackendModelId('Gemma 4 E2B Q4'), 'gemma3:4b');
  assert.equal(normalizeBackendModelId('Gemma 3 4B Q4'), 'gemma3:4b');
  assert.equal(normalizeBackendModelId('qwen coder'), 'qwen2.5-coder:7b');
  assert.equal(normalizeBackendModelId('gemma3:4b'), 'gemma3:4b');
});

