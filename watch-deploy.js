/**
 * watch-deploy.js — Sube cambios a GitHub automáticamente
 * Cada vez que se modifica un archivo, hace git add + commit + push
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const DEBOUNCE_MS = 3000; // Espera 3s después del último cambio antes de subir

// Archivos/carpetas a ignorar
const IGNORE = ['node_modules', '.git', 'tunnel.log', 'tunnel.err', 'data.json'];

let timer = null;
let pendingChanges = false;

function shouldIgnore(filename) {
    return IGNORE.some(ig => filename.includes(ig));
}

function deploy() {
    try {
        console.log('\n📤 Cambios detectados. Subiendo a GitHub...');
        const timestamp = new Date().toLocaleString('es-MX');
        execSync('git add .', { cwd: ROOT, stdio: 'pipe' });
        
        // Verificar si hay algo que commitar
        const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
        if (!status) {
            console.log('✅ No hay cambios nuevos para subir.');
            return;
        }

        execSync(`git commit -m "Actualización automática: ${timestamp}"`, { cwd: ROOT, stdio: 'pipe' });
        execSync('git push origin main', { cwd: ROOT, stdio: 'pipe' });
        console.log(`✅ Cambios subidos a GitHub exitosamente.`);
        console.log(`🚀 Render se está actualizando automáticamente...`);
        console.log(`   (La URL pública reflejará los cambios en ~2 minutos)\n`);
    } catch (e) {
        console.error('❌ Error al subir cambios:', e.message);
    }
}

function scheduleDeployment() {
    pendingChanges = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        if (pendingChanges) {
            pendingChanges = false;
            deploy();
        }
    }, DEBOUNCE_MS);
}

// Vigilar cambios en archivos
fs.watch(ROOT, { recursive: true }, (event, filename) => {
    if (filename && !shouldIgnore(filename)) {
        console.log(`📝 Cambio detectado: ${filename}`);
        scheduleDeployment();
    }
});

console.log('👀 Vigilando cambios en archivos...');
console.log('   Cada cambio que hagas se subirá automáticamente a GitHub y Render.');
console.log('   No cierres esta ventana.\n');
