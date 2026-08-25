const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const targetEntry = path.join(distDir, 'main.js');
const compatibilityEntry = path.join(distDir, 'src', 'main.js');

if (fs.existsSync(targetEntry)) {
  console.log(`Using compiled entrypoint at ${path.relative(projectRoot, targetEntry)}`);
  process.exit(0);
}

if (!fs.existsSync(compatibilityEntry)) {
  console.error(`Expected compiled entrypoint not found at ${path.relative(projectRoot, targetEntry)} or ${path.relative(projectRoot, compatibilityEntry)}`);
  process.exit(1);
}

const shim = [
  "'use strict';",
  "require('./src/main');",
  "",
].join('\n');

fs.writeFileSync(targetEntry, shim, 'utf8');
console.log(`Created Render entrypoint at ${path.relative(projectRoot, targetEntry)}`);
