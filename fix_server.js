const fs = require('fs');
const path = require('path');

// Read current server.js
const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Remove any previously injected broken routes (between config route and Iniciar)
const cleanMarker = "app.get('/api/config'";
const listenMarker = "// Iniciar\napp.listen";

const configIdx = content.indexOf(cleanMarker);
const listenIdx = content.indexOf(listenMarker);

if (configIdx === -1 || listenIdx === -1) {
  console.error('Markers not found');
  process.exit(1);
}

// Keep everything up to and including the /api/config route closing
const configEnd = content.indexOf('\n});', configIdx) + 4;
const before = content.slice(0, configEnd);
const after = content.slice(listenIdx);

// Write clean server without broken injected routes
const clean = before + '\n\n' + after;
fs.writeFileSync(serverPath, clean, 'utf8');
console.log('Server cleaned. Lines:', clean.split('\n').length);
