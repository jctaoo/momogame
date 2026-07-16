/**
 * 纸牌接龙 - 入口
 * 负责：初始化、事件绑定、模块装配
 */

import { play, setEnabled } from 'cuelume';
import { SOUND_STORAGE_KEY, DIFFICULTY_LABEL } from './constants.js';
import { state } from './core/state.js';
import { isWon } from './core/rules.js';
import {
  bindGameHooks,
  newGame,
  undo,
  drawFromStock,
  runAutoComplete,
  applyDifficulty,
  formatTime,
  startTimer,
} from './core/game.js';
import { loadGame } from './core/persist.js';
import { render, updateStats, setWinCheckCallback } from './ui/render.js';
import { showHint } from './ui/hint.js';
import { playFireworks } from './ui/effects.js';
import { clearCssCache } from './utils/css.js';

/* ---------- 音效 ---------- */

function loadSoundPreference() {
  state.soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
  setEnabled(state.soundEnabled);
}

function updateSoundButton() {
  const btn = document.getElementById('btn-sound');
  btn.textContent = state.soundEnabled ? '🔊 音效' : '🔇 静音';
  btn.setAttribute('aria-pressed', String(state.soundEnabled));
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  setEnabled(state.soundEnabled);
  localStorage.setItem(SOUND_STORAGE_KEY, state.soundEnabled ? 'on' : 'off');
  updateSoundButton();
  if (state.soundEnabled) play('toggle');
}

/* ---------- 通关 ---------- */

let winHandled = false;

function handleWin() {
  if (winHandled) return;
  winHandled = true;

  play('success');
  if (state.timerId) clearInterval(state.timerId);

  const label = DIFFICULTY_LABEL[state.difficulty] || '普通';
  document.getElementById('win-stats').textContent =
    `难度：${label} 用时：${formatTime()} 步数：${state.moves} 得分：${state.score}`;
  document.getElementById('win-overlay').classList.add('show');
  playFireworks();
}

/** 新局时重置通关标记（在 newGame 渲染前由按钮触发） */
function resetWinFlag() {
  winHandled = false;
}

/* ---------- 事件绑定 ---------- */

function bindEvents() {
  document.getElementById('stock-pile').addEventListener('click', drawFromStock);
  document.getElementById('btn-undo').onclick = undo;
  document.getElementById('btn-hint').onclick = showHint;
  document.getElementById('btn-new').onclick = () => {
    resetWinFlag();
    newGame();
  };
  document.getElementById('btn-replay').onclick = () => {
    resetWinFlag();
    newGame();
  };
  document.getElementById('btn-sound').onclick = toggleSound;
  document.getElementById('auto-btn').onclick = runAutoComplete;

  document.getElementById('diff-select').addEventListener('change', function () {
    applyDifficulty(this.value);
    resetWinFlag();
    newGame();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      clearCssCache();
      render();
    }, 100);
  });
}

/* ---------- 启动 ---------- */

function init() {
  bindGameHooks({
    render,
    onWin: handleWin,
    updateStats,
  });

  setWinCheckCallback(() => {
    if (isWon()) handleWin();
  });

  loadSoundPreference();
  updateSoundButton();
  bindEvents();

  if (loadGame()) {
    const select = document.getElementById('diff-select');
    if (select) select.value = state.difficulty;
    render();
    if (state.timerStarted && !isWon()) startTimer();
    if (isWon()) handleWin();
  } else {
    newGame();
  }
}

init();
