const fs = require('fs');
const path = require('path');
const distDir = 'D:\\Work\\momgame\\webgame\\dist';
const htmlPath = path.join(distDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Inline CSS
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (m, href) => {
  const cssPath = path.join(distDir, href.replace(/^\//, ''));
  const css = fs.readFileSync(cssPath, 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// Inline JS
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (m, src) => {
  const jsPath = path.join(distDir, src.replace(/^\//, ''));
  const js = fs.readFileSync(jsPath, 'utf8');
  return '<script type="module">\n' + js + '\n</script>';
});

const outPath = 'D:\\Work\\momgame\\solitaire.html';
fs.writeFileSync(outPath, html, 'utf8');
console.log('Wrote single HTML: ' + outPath + ' (' + html.length + ' bytes)');
