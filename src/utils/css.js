/**
 * CSS 自定义属性工具
 * 将 calc() 等表达式解析为实际像素值，供 JS 布局使用
 */

/** 解析结果缓存，避免重复创建临时 DOM */
const cache = new Map();

/**
 * 读取 :root 上的 CSS 变量并解析为像素数值
 * @param {string} name - 变量名，如 '--tab-up'
 * @returns {number}
 */
export function readCssVar(name) {
  if (cache.has(name)) return cache.get(name);

  // 临时元素触发浏览器计算 var()/calc()
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = `var(${name})`;
  document.body.appendChild(probe);

  const value = parseFloat(getComputedStyle(probe).width) || 0;
  document.body.removeChild(probe);
  cache.set(name, value);
  return value;
}

/** 窗口尺寸变化后清空缓存 */
export function clearCssCache() {
  cache.clear();
}
