/**
 * QR-Asistencia — Crypto Utilities
 * HMAC-SHA256 token generation & validation using Web Crypto API
 */

const CryptoUtils = (() => {

    /* -------- KEY MANAGEMENT -------- */

    /** Generate a random 256-bit key as hex string */
    async function generateKey() {
        const key = await crypto.subtle.generateKey(
            { name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']
        );
        const raw = await crypto.subtle.exportKey('raw', key);
        return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Import hex key string as CryptoKey */
    async function importKey(hexKey) {
        const bytes = new Uint8Array(hexKey.match(/.{2}/g).map(h => parseInt(h, 16)));
        return crypto.subtle.importKey(
            'raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
        );
    }

    /* -------- TOKEN GENERATION -------- */

    /**
     * Generate a signed QR payload for an employee.
     * Token structure: JSON {empId, empNum, ts, nonce, sig}
     * ts = unix timestamp (seconds), quantized to tokenLife window for grouping
     * sig = HMAC-SHA256(empId + "|" + empNum + "|" + quantizedTs + "|" + nonce, secretKey)
     */
    async function generateToken(employee, secretKeyHex, tokenLifeSec = 30) {
        const now = Math.floor(Date.now() / 1000);
        const quantizedTs = Math.floor(now / tokenLifeSec) * tokenLifeSec;
        const nonce = generateNonce();
        const message = `${employee.id}|${employee.empNum}|${quantizedTs}|${nonce}`;
        const sig = await hmacSign(message, secretKeyHex);
        const payload = {
            v: 2,                        // version
            eid: employee.id,            // internal ID
            enum: employee.empNum,       // employee number
            ts: quantizedTs,             // quantized timestamp
            exp: quantizedTs + tokenLifeSec, // expiration
            nonce,                       // anti-replay nonce
            sig: sig.slice(0, 32),      // first 32 chars of signature (compact)
        };
        return {
            payload,
            encoded: btoa(JSON.stringify(payload)),
            expiresAt: (quantizedTs + tokenLifeSec) * 1000,
            generatedAt: now * 1000,
        };
    }

    /**
     * Validate a scanned QR payload
     * Returns {valid, reason, employee, type}
     */
    async function validateToken(encoded, secretKeyHex, employees, usedTokens, config) {
        const now = Math.floor(Date.now() / 1000);
        let payload;

        // 1. Decode
        try {
            payload = JSON.parse(atob(encoded));
        } catch {
            return { valid: false, reason: 'QR malformado o ilegible', code: 'DECODE_ERROR' };
        }

        // 2. Version check
        if (!payload.v || payload.v < 1) {
            return { valid: false, reason: 'Versión de token no soportada', code: 'VERSION_ERROR' };
        }

        // 3. Required fields
        if (!payload.eid || !payload.enum || !payload.ts || !payload.nonce || !payload.sig) {
            return { valid: false, reason: 'Token incompleto', code: 'INCOMPLETE_TOKEN' };
        }

        // 4. Time window check
        const window = config.timeWindow || 30;
        const tokenAge = now - payload.ts;
        if (tokenAge > (config.tokenLife + window)) {
            return { valid: false, reason: `Token expirado (${tokenAge}s)`, code: 'EXPIRED' };
        }
        if (payload.ts > now + window) {
            return { valid: false, reason: 'Token con timestamp futuro (reloj desincronizado)', code: 'FUTURE_TS' };
        }

        // 5. Anti-replay check
        if (config.antiReplay && usedTokens.has(payload.nonce)) {
            return { valid: false, reason: 'Token ya utilizado (anti-replay)', code: 'REPLAY_ATTACK' };
        }

        // 6. Find employee
        const employee = employees.find(e => e.id === payload.eid && e.empNum === payload.enum);
        if (!employee) {
            return { valid: false, reason: 'Empleado no encontrado', code: 'UNKNOWN_EMPLOYEE' };
        }
        if (employee.status !== 'active') {
            return { valid: false, reason: 'Empleado inactivo o suspendido', code: 'INACTIVE_EMPLOYEE' };
        }

        // 7. Signature verification
        const message = `${payload.eid}|${payload.enum}|${payload.ts}|${payload.nonce}`;
        const expectedSig = await hmacSign(message, secretKeyHex);
        if (expectedSig.slice(0, 32) !== payload.sig) {
            return { valid: false, reason: 'Firma inválida — posible falsificación', code: 'INVALID_SIGNATURE' };
        }

        // 8. All checks pass
        return { valid: true, employee, payload, code: 'OK' };
    }

    /* -------- HMAC HELPERS -------- */

    async function hmacSign(message, hexKey) {
        const key = await importKey(hexKey);
        const enc = new TextEncoder();
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function generateNonce() {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /* -------- EXPORT -------- */
    return { generateKey, generateToken, validateToken, hmacSign, generateNonce };
})();
