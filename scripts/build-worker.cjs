const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', 'dist', 'server');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'worker.js'),
  path.join(outDir, 'index.js'),
);
