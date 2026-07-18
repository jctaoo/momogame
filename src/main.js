/**
 * 纸牌接龙 - 入口
 * 负责：初始化、事件绑定、模块装配
 */

import { play, setEnabled } from 'cuelume';
import {
  createIcons,
  Gauge,
  House,
  Lightbulb,
  MousePointerClick,
  RefreshCcw,
  RotateCcw,
  Timer,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide';
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
import { loadGame, saveGame } from './core/persist.js';
import { render, updateStats, setWinCheckCallback } from './ui/render.js';
import { showHint } from './ui/hint.js';
import { playFireworks } from './ui/effects.js';
import { clearCssCache } from './utils/css.js';

/* ---------- 音效 ---------- */

const TOOLBAR_ICONS = {
  Gauge,
  House,
  Lightbulb,
  MousePointerClick,
  RefreshCcw,
  RotateCcw,
  Timer,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
};

function renderToolbarIcons() {
  createIcons({
    icons: TOOLBAR_ICONS,
    attrs: {
      width: 17,
      height: 17,
      'stroke-width': 2.2,
    },
  });
}

function loadSoundPreference() {
  state.soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
  setEnabled(state.soundEnabled);
}

function updateSoundButton() {
  const btn = document.getElementById('btn-sound');
  btn.innerHTML = state.soundEnabled
    ? '<i data-lucide="volume-2" aria-hidden="true"></i><span>音效</span>'
    : '<i data-lucide="volume-x" aria-hidden="true"></i><span>静音</span>';
  btn.setAttribute('aria-pressed', String(state.soundEnabled));
  renderToolbarIcons();
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  setEnabled(state.soundEnabled);
  localStorage.setItem(SOUND_STORAGE_KEY, state.soundEnabled ? 'on' : 'off');
  updateSoundButton();
  if (state.soundEnabled) play('toggle');
  updateStartSoundButton();
}

function updateStartSoundButton() {
  const button = document.getElementById('menu-sound');
  if (button) button.textContent = `音效：${state.soundEnabled ? '开' : '关'}`;
}

function closeStartScreen() {
  document.getElementById('start-screen').classList.add('start-screen--hidden');
}

function openStartScreen() {
  document.getElementById('start-screen').classList.remove('start-screen--hidden');
}

function returnToHome() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  saveGame();
  document.getElementById('menu-continue').disabled = false;
  openStartScreen();
}

/** 为首页可点击控件提供统一的悬停与确认音效（音效总开关由 cuelume 控制）。 */
function bindStartMenuSounds() {
  const controls = document.querySelectorAll(
    '.start-menu-button, #menu-sound, #menu-difficulty-trigger, #menu-difficulty-options button',
  );
  controls.forEach((control) => {
    control.addEventListener('pointerenter', () => {
      if (!control.disabled) play('whisper');
    });
    control.addEventListener('click', () => {
      if (!control.disabled) play('press');
    });
  });
}

function setMenuDifficulty(value) {
  const options = document.querySelectorAll('#menu-difficulty-options [data-value]');
  const selected = [...options].find((option) => option.dataset.value === value);
  if (!selected) return;
  document.querySelector('#menu-difficulty-trigger span').textContent = selected.textContent;
  options.forEach((option) => {
    option.setAttribute('aria-selected', String(option === selected));
  });
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

  document.getElementById('menu-start').onclick = () => {
    resetWinFlag();
    newGame();
    closeStartScreen();
  };
  document.getElementById('menu-continue').onclick = () => {
    closeStartScreen();
    if (state.timerStarted && !state.timerId && !isWon()) startTimer();
  };
  document.getElementById('menu-settings').onclick = () => {
    const panel = document.getElementById('start-settings');
    const expanded = panel.hidden;
    panel.hidden = !expanded;
    document.getElementById('menu-settings').setAttribute('aria-expanded', String(expanded));
  };
  document.getElementById('menu-difficulty-trigger').onclick = () => {
    const options = document.getElementById('menu-difficulty-options');
    const isOpening = options.hidden;
    options.hidden = !isOpening;
    document.getElementById('menu-difficulty-trigger').setAttribute('aria-expanded', String(isOpening));
  };
  document.querySelectorAll('#menu-difficulty-options [data-value]').forEach((option) => {
    option.onclick = () => {
      const value = option.dataset.value;
      const select = document.getElementById('diff-select');
      select.value = value;
      setMenuDifficulty(value);
      document.getElementById('menu-difficulty-options').hidden = true;
      document.getElementById('menu-difficulty-trigger').setAttribute('aria-expanded', 'false');
      applyDifficulty(value);
      resetWinFlag();
      newGame();
    };
  });
  /* 首页设置与牌局顶栏的难度保持同步。 */
  document.getElementById('diff-select').addEventListener('change', function () {
    setMenuDifficulty(this.value);
  });
  document.getElementById('menu-sound').onclick = toggleSound;
  document.getElementById('btn-home').onclick = returnToHome;
  bindStartMenuSounds();

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
  updateStartSoundButton();
  bindEvents();

  const hasSavedGame = loadGame();
  document.getElementById('menu-continue').disabled = !hasSavedGame;
  if (hasSavedGame) {
    const select = document.getElementById('diff-select');
    if (select) select.value = state.difficulty;
    setMenuDifficulty(state.difficulty);
    render();
    if (state.timerStarted && !isWon()) startTimer();
    if (isWon()) handleWin();
  } else {
    newGame();
  }

  openStartScreen();
}

init();
