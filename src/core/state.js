/**
 * 游戏运行时状态
 * 所有模块通过本对象读写，避免散落的全局变量
 */

import { TABLEAU_COUNT, FOUNDATION_COUNT } from '../constants.js';

/**
 * @typedef {Object} Card
 * @property {string} suit  - 花色符号
 * @property {string} rank  - 点数
 * @property {string} color - 'red' | 'black'
 * @property {boolean} faceUp - 是否正面朝上
 * @property {string} id    - 唯一标识，如 'A♠'
 */

/**
 * @typedef {Object} DragSession
 * @property {Card[]} cards
 * @property {HTMLElement[]} elements
 * @property {string} sourceType  - 'w' | 't' | 'f'
 * @property {number} sourceIndex
 * @property {number} cardIndex
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} stackOffset
 */

/** 可变游戏状态 */
export const state = {
  /** @type {Card[]} 牌库（背面朝下） */
  stock: [],

  /** @type {Card[]} 废牌区（正面朝上） */
  waste: [],

  /** @type {Card[][]} 四个基础区，按花色收牌 */
  foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),

  /** @type {Card[][]} 七列桌面牌 */
  tableau: Array.from({ length: TABLEAU_COUNT }, () => []),

  /** 步数 */
  moves: 0,

  /** 得分 */
  score: 0,

  /** 用时（秒） */
  elapsedSeconds: 0,

  /** 计时器句柄 */
  timerId: null,

  /** 是否已开始计时 */
  timerStarted: false,

  /** 撤销历史栈 */
  history: [],

  /** 当前拖拽会话，无拖拽时为 null */
  drag: null,

  /** 松手后落子动画进行中，防止重复提交 */
  dropCommitPending: false,

  /** 当前难度 */
  difficulty: 'normal',

  /** 每次翻牌张数 */
  drawCount: 3,

  /** 重发次数上限，-1 无限 */
  maxRedeals: -1,

  /** 已使用重发次数 */
  redealsUsed: 0,

  /** 音效是否开启 */
  soundEnabled: true,
};

/** 重置计分与计时相关字段（保留难度设置） */
export function resetStats() {
  state.moves = 0;
  state.score = 0;
  state.elapsedSeconds = 0;
  state.timerStarted = false;
  state.history = [];
  state.drag = null;
  state.redealsUsed = 0;

  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/** 清空所有牌堆 */
export function clearPiles() {
  state.stock = [];
  state.waste = [];
  state.foundations = Array.from({ length: FOUNDATION_COUNT }, () => []);
  state.tableau = Array.from({ length: TABLEAU_COUNT }, () => []);
}
