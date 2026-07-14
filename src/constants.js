/**
 * 游戏常量与配置
 * Klondike 接龙：52 张牌、7 列桌面、4 个基础区
 */

/** 四种花色 */
export const SUITS = ['♠', '♥', '♦', '♣'];

/** 花色对应颜色 */
export const SUIT_COLOR = {
  '♠': 'black',
  '♣': 'black',
  '♥': 'red',
  '♦': 'red',
};

/** 点数序列（A 到 K） */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** 点数数值映射，A=1 … K=13 */
export const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 1]));

/** 桌面列数 */
export const TABLEAU_COUNT = 7;

/** 基础区数量（每种花色一列） */
export const FOUNDATION_COUNT = 4;

/** 整副牌张数 */
export const DECK_SIZE = 52;

/**
 * 难度配置
 * - drawCount: 每次从牌库翻出的张数
 * - maxRedeals: 废牌回库次数上限，-1 表示无限
 * - dealAttempts: 开局发牌时尝试次数（越高越容易拿到好开局）
 */
export const DIFFICULTY = {
  easy:   { drawCount: 1, maxRedeals: -1, dealAttempts: 96 },
  normal: { drawCount: 3, maxRedeals: -1, dealAttempts: 32 },
  hard:   { drawCount: 3, maxRedeals:  3, dealAttempts:  1 },
};

/** 难度显示名称 */
export const DIFFICULTY_LABEL = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

/** localStorage 音效开关键名 */
export const SOUND_STORAGE_KEY = 'solitaire-sound';
