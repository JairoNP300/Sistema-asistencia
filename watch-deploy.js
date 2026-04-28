/**
 * watch-deploy.js — Auto-deploy a GitHub con debounce reducido
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const DEBOUNCE_MS = 1500; // 1.5s después del último cambio

const IGNORE = ['node_modules', '.git', 'tunnel.log', 'tunnel.err', 'data.json', 'build.hash'];

let timer = null;

function shouldIgnore(filename) {
    return IGNORE.some(ig => filename.includes(ig));
}

function deploy() {
    try {
        execSync('git add .', { cwd: ROOT, stdio: 'pipe' });
        const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
        if (!status) { console.log('✅ Sin cambios nuevos.'); return; }

        const timestamp = new Date().toLocaleString('es-MX');
        execSync(`git commit -m "Auto: ${timestamp}"`, { cwd: ROOT, stdio: 'pipe' });
        execSync('git push origin main', { cwd: ROOT, stdio: 'pipe' });

        // Escribir hash del build para que el frontend detecte la nueva versión
        const hash = Date.now().toString(36);
        fs.writeFileSync(path.join(ROOT, 'build.hash'), hash);

        console.log(`✅ [${new Date().toLocaleTimeString()}] Subido a GitHub → Render actualizando...`);
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

function scheduleDeployment() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(deploy, DEBOUNCE_MS);
}

fs.watch(ROOT, { recursive: true }, (event, filename) => {
    if (filename && !shouldIgnore(filename)) {
        process.stdout.write(`\r📝 ${filename} → subiendo en ${DEBOUNCE_MS/1000}s...`);
        scheduleDeployment();
    }
});

console.log('👀 Auto-deploy activo. Cambios → GitHub → Render automáticamente.\n');
