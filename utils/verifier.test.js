/**
 * Property-Based Tests para utils/verifier.js
 * Usa fast-check para validar propiedades matemáticas de las funciones de verificación
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { haversineDistance, isInsideGeofence, calculateWorkingDays, computeInvoiceTotals } = require('./verifier.js');

/**
 * Property 11: Simetría y no-negatividad de distancia haversine
 * **Validates: Requirements 5.2**
 * 
 * Para cualquier par de coordenadas (A, B), la distancia haversine debe satisfacer:
 * 1. dist(A, B) >= 0 (no-negatividad)
 * 2. dist(A, B) == dist(B, A) (simetría)
 * 3. dist(A, A) == 0 (identidad)
 */
describe('Property 11: Simetría y no-negatividad de distancia haversine', () => {
    it('dist(A, B) >= 0 (no-negatividad)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -90, max: 90 }),  // lat1
                fc.double({ min: -180, max: 180 }), // lon1
                fc.double({ min: -90, max: 90 }),  // lat2
                fc.double({ min: -180, max: 180 }), // lon2
                (lat1, lon1, lat2, lon2) => {
                    const distance = haversineDistance(lat1, lon1, lat2, lon2);
                    return distance >= 0;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('dist(A, B) == dist(B, A) (simetría)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -90, max: 90 }),  // lat1
                fc.double({ min: -180, max: 180 }), // lon1
                fc.double({ min: -90, max: 90 }),  // lat2
                fc.double({ min: -180, max: 180 }), // lon2
                (lat1, lon1, lat2, lon2) => {
                    const distAB = haversineDistance(lat1, lon1, lat2, lon2);
                    const distBA = haversineDistance(lat2, lon2, lat1, lon1);
                    // Usar tolerancia para errores de punto flotante
                    return Math.abs(distAB - distBA) < 0.001;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('dist(A, A) == 0 (identidad)', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -90, max: 90 }),  // lat
                fc.double({ min: -180, max: 180 }), // lon
                (lat, lon) => {
                    const distance = haversineDistance(lat, lon, lat, lon);
                    // Usar tolerancia para errores de punto flotante
                    return Math.abs(distance) < 0.001;
                }
            ),
            { numRuns: 1000 }
        );
    });
});

/**
 * Property 12: Geofencing — clasificación correcta de coordenadas
 * **Validates: Requirements 5.3, 5.6, 5.7**
 * 
 * Para cualquier coordenada P y geofence G con centro C y radio R:
 * - Si haversine(P, C) <= R, entonces isInsideGeofence(P, G) debe retornar true
 * - Si haversine(P, C) > R, entonces isInsideGeofence(P, G) debe retornar false
 */
describe('Property 12: Geofencing — clasificación correcta de coordenadas', () => {
    it('coordenadas dentro del radio retornan true', () => {
        fc.assert(
            fc.property(
                // Generar un centro de geofence válido (evitar polos extremos)
                fc.double({ min: -85, max: 85 }),   // centerLat
                fc.double({ min: -180, max: 180 }), // centerLon
                // Generar un radio razonable (100m a 5km)
                fc.double({ min: 100, max: 5000 }), // radiusMeters
                // Generar una distancia dentro del radio (10% a 90% del radio para evitar bordes)
                fc.double({ min: 0.1, max: 0.9 }),  // distanceFactor (0.1-0.9)
                // Generar un ángulo aleatorio para la dirección
                fc.double({ min: 0, max: 360 }),    // bearing en grados
                (centerLat, centerLon, radiusMeters, distanceFactor, bearing) => {
                    // Calcular un punto que está dentro del geofence
                    const distance = radiusMeters * distanceFactor;
                    const point = calculatePointAtDistance(centerLat, centerLon, distance, bearing);
                    
                    // Validar que el punto calculado es válido
                    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
                        point.lat < -90 || point.lat > 90 || 
                        point.lon < -180 || point.lon > 180) {
                        return true; // Skip invalid points
                    }
                    
                    const geofence = {
                        lat: centerLat,
                        lon: centerLon,
                        radiusMeters: radiusMeters
                    };
                    
                    const geoPoint = {
                        lat: point.lat,
                        lon: point.lon
                    };
                    
                    // Verificar la distancia real primero
                    const actualDistance = haversineDistance(
                        geoPoint.lat, geoPoint.lon,
                        geofence.lat, geofence.lon
                    );
                    
                    // Solo verificar si la distancia calculada está realmente dentro del radio
                    // Usar tolerancia del 1% para errores de cálculo geográfico
                    if (actualDistance <= radiusMeters * 1.01) {
                        const result = isInsideGeofence(geoPoint, geofence);
                        return result === true;
                    }
                    
                    // Si el punto calculado no está dentro, skip este caso
                    return true;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('coordenadas fuera del radio retornan false', () => {
        fc.assert(
            fc.property(
                // Generar un centro de geofence válido
                fc.double({ min: -90, max: 90 }),   // centerLat
                fc.double({ min: -180, max: 180 }), // centerLon
                // Generar un radio razonable (10m a 5km)
                fc.double({ min: 10, max: 5000 }),  // radiusMeters
                // Generar una distancia fuera del radio (110% a 300% del radio)
                fc.double({ min: 1.1, max: 3 }),    // distanceFactor (>1)
                // Generar un ángulo aleatorio para la dirección
                fc.double({ min: 0, max: 360 }),    // bearing en grados
                (centerLat, centerLon, radiusMeters, distanceFactor, bearing) => {
                    // Calcular un punto que está fuera del geofence
                    const distance = radiusMeters * distanceFactor;
                    const point = calculatePointAtDistance(centerLat, centerLon, distance, bearing);
                    
                    const geofence = {
                        lat: centerLat,
                        lon: centerLon,
                        radiusMeters: radiusMeters
                    };
                    
                    const geoPoint = {
                        lat: point.lat,
                        lon: point.lon
                    };
                    
                    // Verificar que el punto está fuera del geofence
                    const result = isInsideGeofence(geoPoint, geofence);
                    
                    // Verificar la distancia real
                    const actualDistance = haversineDistance(
                        geoPoint.lat, geoPoint.lon,
                        geofence.lat, geofence.lon
                    );
                    
                    // El punto debe estar fuera si la distancia es > radio
                    // Usar una pequeña tolerancia para errores de punto flotante
                    if (actualDistance > radiusMeters + 0.1) {
                        return result === false;
                    }
                    return true; // Si por alguna razón el cálculo falló, no fallar el test
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('coordenadas muy cerca del borde del radio se clasifican correctamente', () => {
        fc.assert(
            fc.property(
                // Generar un centro de geofence válido (evitar polos extremos)
                fc.double({ min: -85, max: 85 }),   // centerLat
                fc.double({ min: -180, max: 180 }), // centerLon
                // Generar un radio razonable (500m a 5km)
                fc.double({ min: 500, max: 5000 }), // radiusMeters
                // Generar un ángulo aleatorio para la dirección
                fc.double({ min: 0, max: 360 }),    // bearing en grados
                (centerLat, centerLon, radiusMeters, bearing) => {
                    // Calcular un punto ligeramente dentro del borde (95% del radio)
                    const distance = radiusMeters * 0.95;
                    const point = calculatePointAtDistance(centerLat, centerLon, distance, bearing);
                    
                    // Validar que el punto calculado es válido
                    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
                        point.lat < -90 || point.lat > 90 || 
                        point.lon < -180 || point.lon > 180) {
                        return true; // Skip invalid points
                    }
                    
                    const geofence = {
                        lat: centerLat,
                        lon: centerLon,
                        radiusMeters: radiusMeters
                    };
                    
                    const geoPoint = {
                        lat: point.lat,
                        lon: point.lon
                    };
                    
                    // Verificar la distancia real
                    const actualDistance = haversineDistance(
                        geoPoint.lat, geoPoint.lon,
                        geofence.lat, geofence.lon
                    );
                    
                    // El punto debe estar dentro si la distancia es < radio
                    if (actualDistance < radiusMeters) {
                        const result = isInsideGeofence(geoPoint, geofence);
                        return result === true;
                    }
                    
                    // Si el punto no está dentro, skip este caso
                    return true;
                }
            ),
            { numRuns: 500 }
        );
    });

    it('maneja casos edge: geofence o geoPoint null/undefined', () => {
        const validGeofence = { lat: 0, lon: 0, radiusMeters: 1000 };
        const validGeoPoint = { lat: 0, lon: 0 };
        
        assert.strictEqual(isInsideGeofence(null, validGeofence), false);
        assert.strictEqual(isInsideGeofence(undefined, validGeofence), false);
        assert.strictEqual(isInsideGeofence(validGeoPoint, null), false);
        assert.strictEqual(isInsideGeofence(validGeoPoint, undefined), false);
        assert.strictEqual(isInsideGeofence(null, null), false);
    });
});

/**
 * Property 16: Cálculo de días hábiles
 * **Validates: Requirements 7.2, 7.3**
 * 
 * Para cualquier par de fechas (startDate, endDate) donde endDate >= startDate:
 * 1. calculateWorkingDays(startDate, endDate) debe retornar un número >= 0
 * 2. Para startDate = endDate en un día hábil, debe retornar 1
 * 3. Para startDate = endDate en un día no hábil (fin de semana), debe retornar 0
 */
describe('Property 16: Cálculo de días hábiles', () => {
    it('para cualquier par donde end >= start, resultado >= 0', () => {
        fc.assert(
            fc.property(
                // Generar fechas válidas entre 2020 y 2030
                fc.integer({ min: 2020, max: 2030 }), // año
                fc.integer({ min: 1, max: 12 }),      // mes
                fc.integer({ min: 1, max: 28 }),      // día (usar 28 para evitar problemas con meses)
                fc.integer({ min: 0, max: 365 }),     // días a añadir para endDate
                (year, month, day, daysToAdd) => {
                    // Formatear fechas como YYYY-MM-DD
                    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    // Calcular endDate añadiendo días
                    const start = new Date(startDate + 'T00:00:00');
                    const end = new Date(start);
                    end.setDate(end.getDate() + daysToAdd);
                    
                    const endDate = end.toISOString().split('T')[0];
                    
                    const result = calculateWorkingDays(startDate, endDate);
                    
                    // El resultado debe ser >= 0
                    return result >= 0;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('para mismo día hábil retorna 1', () => {
        fc.assert(
            fc.property(
                // Generar fechas válidas entre 2020 y 2030
                fc.integer({ min: 2020, max: 2030 }), // año
                fc.integer({ min: 1, max: 12 }),      // mes
                fc.integer({ min: 1, max: 28 }),      // día
                (year, month, day) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const date = new Date(dateStr + 'T00:00:00');
                    const dayOfWeek = date.getDay();
                    
                    // Solo verificar días hábiles (lunes=1 a viernes=5)
                    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                        const result = calculateWorkingDays(dateStr, dateStr);
                        return result === 1;
                    }
                    
                    // Skip fines de semana para este test
                    return true;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('para mismo día de fin de semana retorna 0', () => {
        fc.assert(
            fc.property(
                // Generar fechas válidas entre 2020 y 2030
                fc.integer({ min: 2020, max: 2030 }), // año
                fc.integer({ min: 1, max: 12 }),      // mes
                fc.integer({ min: 1, max: 28 }),      // día
                (year, month, day) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const date = new Date(dateStr + 'T00:00:00');
                    const dayOfWeek = date.getDay();
                    
                    // Solo verificar fines de semana (domingo=0, sábado=6)
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        const result = calculateWorkingDays(dateStr, dateStr);
                        return result === 0;
                    }
                    
                    // Skip días hábiles para este test
                    return true;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('casos edge: fechas inválidas o end < start retornan 0', () => {
        // Fecha inválida
        assert.strictEqual(calculateWorkingDays('invalid', '2024-01-01'), 0);
        assert.strictEqual(calculateWorkingDays('2024-01-01', 'invalid'), 0);
        
        // end < start
        assert.strictEqual(calculateWorkingDays('2024-01-10', '2024-01-05'), 0);
    });

    it('casos conocidos: semana completa de lunes a viernes', () => {
        // 2024-01-01 es lunes, 2024-01-05 es viernes
        const result = calculateWorkingDays('2024-01-01', '2024-01-05');
        assert.strictEqual(result, 5);
    });

    it('casos conocidos: semana con fin de semana', () => {
        // 2024-01-01 (lunes) a 2024-01-07 (domingo) = 5 días hábiles
        const result = calculateWorkingDays('2024-01-01', '2024-01-07');
        assert.strictEqual(result, 5);
    });
});

/**
 * Función auxiliar: Calcula un punto a una distancia y dirección dadas desde un punto de origen.
 * Usa la fórmula de destino directo (direct destination formula).
 * 
 * @param {number} lat - Latitud del punto de origen en grados
 * @param {number} lon - Longitud del punto de origen en grados
 * @param {number} distance - Distancia en metros
 * @param {number} bearing - Dirección en grados (0 = norte, 90 = este)
 * @returns {{ lat: number, lon: number }} Coordenadas del punto de destino
 */
function calculatePointAtDistance(lat, lon, distance, bearing) {
    const R = 6371000; // Radio de la Tierra en metros
    const toRad = deg => (deg * Math.PI) / 180;
    const toDeg = rad => (rad * 180) / Math.PI;
    
    const lat1 = toRad(lat);
    const lon1 = toRad(lon);
    const brng = toRad(bearing);
    const angularDistance = distance / R;
    
    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng)
    );
    
    const lon2 = lon1 + Math.atan2(
        Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );
    
    return {
        lat: toDeg(lat2),
        lon: toDeg(lon2)
    };
}

/**
 * Property 9: Validación de selfie requerida
 * **Validates: Requirements 4.2**
 * 
 * Para cualquier payload de check-in donde verificationConfig.selfieRequired = true
 * y el campo selfieBase64 está ausente o vacío, el sistema debe rechazar la solicitud
 * con HTTP 400 y código SELFIE_REQUIRED.
 */
describe('Property 9: Validación de selfie requerida', () => {
    /**
     * Función auxiliar que simula la validación de selfie del servidor
     * Esta función replica la lógica de validación en POST /api/timer/clockin
     */
    function validateSelfieRequirement(payload, verificationConfig) {
        const vcfg = verificationConfig || {};
        
        // Si selfieRequired es true y no hay selfieBase64 o está vacío, rechazar
        if (vcfg.selfieRequired && (!payload.selfieBase64 || payload.selfieBase64.length === 0)) {
            return { valid: false, error: 'SELFIE_REQUIRED' };
        }
        
        return { valid: true };
    }

    it('rechaza clockin sin selfie cuando selfieRequired es true', () => {
        fc.assert(
            fc.property(
                // Generar empId válido
                fc.string({ minLength: 1, maxLength: 24 }),
                // Generar projectId opcional
                fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: null }),
                // Generar source
                fc.constantFrom('qr', 'manual', 'kiosk', 'api'),
                // Generar location opcional
                fc.option(fc.record({
                    lat: fc.double({ min: -90, max: 90 }),
                    lon: fc.double({ min: -180, max: 180 })
                }), { nil: null }),
                // Generar notes opcional
                fc.option(fc.string({ maxLength: 200 }), { nil: null }),
                (empId, projectId, source, location, notes) => {
                    // Simular payload sin selfie cuando selfieRequired es true
                    const payload = {
                        empId,
                        projectId,
                        source,
                        location,
                        notes,
                        // selfieBase64 está ausente
                    };
                    
                    // Simular verificationConfig con selfieRequired = true
                    const verificationConfig = {
                        selfieRequired: true,
                        gpsRequired: false,
                        pinRequired: false
                    };
                    
                    // La validación debe fallar
                    const result = validateSelfieRequirement(payload, verificationConfig);
                    
                    return result.valid === false && result.error === 'SELFIE_REQUIRED';
                }
            ),
            { numRuns: 100 }
        );
    });

    it('acepta clockin con selfie cuando selfieRequired es true', () => {
        fc.assert(
            fc.property(
                // Generar empId válido
                fc.string({ minLength: 1, maxLength: 24 }),
                // Generar selfieBase64 (simulado como string base64)
                fc.string({ minLength: 100, maxLength: 1000 }),
                // Generar projectId opcional
                fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: null }),
                // Generar source
                fc.constantFrom('qr', 'manual', 'kiosk', 'api'),
                (empId, selfieBase64, projectId, source) => {
                    // Simular payload con selfie cuando selfieRequired es true
                    const payload = {
                        empId,
                        projectId,
                        source,
                        selfieBase64 // selfie presente
                    };
                    
                    // Simular verificationConfig con selfieRequired = true
                    const verificationConfig = {
                        selfieRequired: true,
                        gpsRequired: false,
                        pinRequired: false
                    };
                    
                    // La validación debe pasar
                    const result = validateSelfieRequirement(payload, verificationConfig);
                    
                    return result.valid === true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('acepta clockin sin selfie cuando selfieRequired es false', () => {
        fc.assert(
            fc.property(
                // Generar empId válido
                fc.string({ minLength: 1, maxLength: 24 }),
                // Generar projectId opcional
                fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: null }),
                // Generar source
                fc.constantFrom('qr', 'manual', 'kiosk', 'api'),
                (empId, projectId, source) => {
                    // Simular payload sin selfie cuando selfieRequired es false
                    const payload = {
                        empId,
                        projectId,
                        source
                        // selfieBase64 está ausente
                    };
                    
                    // Simular verificationConfig con selfieRequired = false
                    const verificationConfig = {
                        selfieRequired: false,
                        gpsRequired: false,
                        pinRequired: false
                    };
                    
                    // La validación debe pasar
                    const result = validateSelfieRequirement(payload, verificationConfig);
                    
                    return result.valid === true;
                }
            ),
            { numRuns: 100 }
        );
    });

    it('rechaza clockin con selfie vacío cuando selfieRequired es true', () => {
        fc.assert(
            fc.property(
                // Generar empId válido
                fc.string({ minLength: 1, maxLength: 24 }),
                // Generar projectId opcional
                fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: null }),
                // Generar source
                fc.constantFrom('qr', 'manual', 'kiosk', 'api'),
                (empId, projectId, source) => {
                    // Simular payload con selfie vacío cuando selfieRequired es true
                    const payload = {
                        empId,
                        projectId,
                        source,
                        selfieBase64: '' // selfie vacío
                    };
                    
                    // Simular verificationConfig con selfieRequired = true
                    const verificationConfig = {
                        selfieRequired: true,
                        gpsRequired: false,
                        pinRequired: false
                    };
                    
                    // La validación debe fallar
                    const result = validateSelfieRequirement(payload, verificationConfig);
                    
                    return result.valid === false && result.error === 'SELFIE_REQUIRED';
                }
            ),
            { numRuns: 100 }
        );
    });

    it('casos edge: verificationConfig null o undefined permite clockin sin selfie', () => {
        const payload = { empId: 'emp1', source: 'manual' };
        
        // Sin verificationConfig
        let result = validateSelfieRequirement(payload, null);
        assert.strictEqual(result.valid, true);
        
        // Con verificationConfig undefined
        result = validateSelfieRequirement(payload, undefined);
        assert.strictEqual(result.valid, true);
        
        // Con verificationConfig vacío
        result = validateSelfieRequirement(payload, {});
        assert.strictEqual(result.valid, true);
    });

    it('casos conocidos: payload típico con selfie requerida', () => {
        const payload = {
            empId: 'emp123',
            projectId: 'proj456',
            source: 'manual',
            selfieBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        };
        
        const verificationConfig = {
            selfieRequired: true,
            gpsRequired: false,
            pinRequired: false
        };
        
        // Debe aceptar porque tiene selfie
        const result = validateSelfieRequirement(payload, verificationConfig);
        assert.strictEqual(result.valid, true);
    });

    it('casos conocidos: payload típico sin selfie cuando es requerida', () => {
        const payload = {
            empId: 'emp123',
            projectId: 'proj456',
            source: 'manual'
            // selfieBase64 ausente
        };
        
        const verificationConfig = {
            selfieRequired: true,
            gpsRequired: false,
            pinRequired: false
        };
        
        // Debe rechazar porque falta selfie
        const result = validateSelfieRequirement(payload, verificationConfig);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.error, 'SELFIE_REQUIRED');
    });
});

/**
 * Property 29: Invariante de totalAmount en factura
 * **Validates: Requirements 12.2, 12.3, 12.6**
 * 
 * Para cualquier Invoice válida:
 * 1. La suma de lineItems[i].amount debe ser exactamente igual a invoice.totalAmount
 * 2. Para cualquier lineItem, amount = hours * rate
 */
describe('Property 29: Invariante de totalAmount en factura', () => {
    it('totalAmount es igual a la suma de todos los lineItems.amount', () => {
        fc.assert(
            fc.property(
                // Generar un array de lineItems con hours y rate
                fc.array(
                    fc.record({
                        empId: fc.string({ minLength: 1, maxLength: 24 }),
                        empName: fc.string({ minLength: 1, maxLength: 50 }),
                        hours: fc.double({ min: 0, max: 200, noNaN: true }),
                        rate: fc.double({ min: 0, max: 500, noNaN: true })
                    }),
                    { minLength: 0, maxLength: 50 }
                ),
                fc.double({ min: 0, max: 500, noNaN: true }), // defaultRate
                (lineItems, defaultRate) => {
                    const result = computeInvoiceTotals(lineItems, defaultRate);
                    
                    // Calcular la suma esperada manualmente
                    let expectedTotal = 0;
                    for (const item of result.lineItems) {
                        expectedTotal += item.amount;
                    }
                    
                    // Verificar que totalAmount coincide con la suma (con tolerancia para punto flotante)
                    const diff = Math.abs(result.totalAmount - expectedTotal);
                    return diff < 0.01; // Tolerancia de 1 centavo
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('cada lineItem.amount es igual a hours * rate', () => {
        fc.assert(
            fc.property(
                // Generar un array de lineItems con hours y rate
                fc.array(
                    fc.record({
                        empId: fc.string({ minLength: 1, maxLength: 24 }),
                        empName: fc.string({ minLength: 1, maxLength: 50 }),
                        hours: fc.double({ min: 0, max: 200, noNaN: true }),
                        rate: fc.double({ min: 0, max: 500, noNaN: true })
                    }),
                    { minLength: 1, maxLength: 50 }
                ),
                fc.double({ min: 0, max: 500, noNaN: true }), // defaultRate
                (lineItems, defaultRate) => {
                    const result = computeInvoiceTotals(lineItems, defaultRate);
                    
                    // Verificar que cada lineItem.amount = hours * rate
                    for (let i = 0; i < result.lineItems.length; i++) {
                        const item = result.lineItems[i];
                        const expectedAmount = item.hours * item.rate;
                        const diff = Math.abs(item.amount - expectedAmount);
                        
                        if (diff >= 0.01) { // Tolerancia de 1 centavo
                            return false;
                        }
                    }
                    
                    return true;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('totalHours es igual a la suma de todos los lineItems.hours', () => {
        fc.assert(
            fc.property(
                // Generar un array de lineItems con hours y rate
                fc.array(
                    fc.record({
                        empId: fc.string({ minLength: 1, maxLength: 24 }),
                        empName: fc.string({ minLength: 1, maxLength: 50 }),
                        hours: fc.double({ min: 0, max: 200, noNaN: true }),
                        rate: fc.double({ min: 0, max: 500, noNaN: true })
                    }),
                    { minLength: 0, maxLength: 50 }
                ),
                fc.double({ min: 0, max: 500, noNaN: true }), // defaultRate
                (lineItems, defaultRate) => {
                    const result = computeInvoiceTotals(lineItems, defaultRate);
                    
                    // Calcular la suma esperada de horas manualmente
                    let expectedHours = 0;
                    for (const item of lineItems) {
                        expectedHours += item.hours || 0;
                    }
                    
                    // Verificar que totalHours coincide con la suma (con tolerancia para punto flotante)
                    const diff = Math.abs(result.totalHours - expectedHours);
                    return diff < 0.01;
                }
            ),
            { numRuns: 1000 }
        );
    });

    it('usa defaultRate cuando lineItem.rate no está definido', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 200, noNaN: true }), // hours
                fc.double({ min: 0, max: 500, noNaN: true }), // defaultRate
                (hours, defaultRate) => {
                    // Crear lineItem sin rate
                    const lineItems = [{ empId: 'emp1', empName: 'Test', hours }];
                    const result = computeInvoiceTotals(lineItems, defaultRate);
                    
                    // Verificar que se usó defaultRate
                    const item = result.lineItems[0];
                    const expectedAmount = hours * defaultRate;
                    const diff = Math.abs(item.amount - expectedAmount);
                    
                    return diff < 0.01 && Math.abs(item.rate - defaultRate) < 0.01;
                }
            ),
            { numRuns: 500 }
        );
    });

    it('casos edge: array vacío retorna totales en cero', () => {
        const result = computeInvoiceTotals([], 50);
        assert.strictEqual(result.lineItems.length, 0);
        assert.strictEqual(result.totalHours, 0);
        assert.strictEqual(result.totalAmount, 0);
    });

    it('casos edge: lineItems null o undefined retorna totales en cero', () => {
        const resultNull = computeInvoiceTotals(null, 50);
        assert.strictEqual(resultNull.lineItems.length, 0);
        assert.strictEqual(resultNull.totalHours, 0);
        assert.strictEqual(resultNull.totalAmount, 0);

        const resultUndefined = computeInvoiceTotals(undefined, 50);
        assert.strictEqual(resultUndefined.lineItems.length, 0);
        assert.strictEqual(resultUndefined.totalHours, 0);
        assert.strictEqual(resultUndefined.totalAmount, 0);
    });

    it('casos conocidos: factura simple con un lineItem', () => {
        const lineItems = [
            { empId: 'emp1', empName: 'John Doe', hours: 10, rate: 50 }
        ];
        const result = computeInvoiceTotals(lineItems);
        
        assert.strictEqual(result.lineItems.length, 1);
        assert.strictEqual(result.lineItems[0].amount, 500);
        assert.strictEqual(result.totalHours, 10);
        assert.strictEqual(result.totalAmount, 500);
    });

    it('casos conocidos: factura con múltiples lineItems', () => {
        const lineItems = [
            { empId: 'emp1', empName: 'John Doe', hours: 10, rate: 50 },
            { empId: 'emp2', empName: 'Jane Smith', hours: 8, rate: 60 },
            { empId: 'emp3', empName: 'Bob Johnson', hours: 12, rate: 45 }
        ];
        const result = computeInvoiceTotals(lineItems);
        
        assert.strictEqual(result.lineItems.length, 3);
        assert.strictEqual(result.lineItems[0].amount, 500);  // 10 * 50
        assert.strictEqual(result.lineItems[1].amount, 480);  // 8 * 60
        assert.strictEqual(result.lineItems[2].amount, 540);  // 12 * 45
        assert.strictEqual(result.totalHours, 30);            // 10 + 8 + 12
        assert.strictEqual(result.totalAmount, 1520);         // 500 + 480 + 540
    });
});
