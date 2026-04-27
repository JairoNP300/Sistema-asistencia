/**
 * verifier.js — Utilidades de verificación para Jibble Integration
 * Haversine, Geofencing, Días hábiles, Totales de factura
 */

const EARTH_RADIUS_M = 6371000;

/**
 * Calcula distancia en metros entre dos coordenadas usando fórmula haversine.
 * Propiedades: dist(A,B) >= 0, dist(A,B) == dist(B,A), dist(A,A) == 0
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Verifica si un GeoPoint está dentro de un geofence circular.
 * @param {{ lat, lon }} geoPoint
 * @param {{ lat, lon, radiusMeters }} geofence
 */
function isInsideGeofence(geoPoint, geofence) {
    const dist = haversineDistance(geoPoint.lat, geoPoint.lon, geofence.lat, geofence.lon);
    return dist <= geofence.radiusMeters;
}

/**
 * Calcula días hábiles (lunes–viernes) entre dos fechas YYYY-MM-DD (inclusive).
 * Retorna >= 0 siempre. Para mismo día hábil retorna 1; fin de semana retorna 0.
 */
function calculateWorkingDays(startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

/**
 * Calcula totales de factura a partir de lineItems.
 * Invariante: sum(lineItems[i].amount) === totalAmount
 * @param {Array<{empId,empName,hours,rate}>} lineItems
 * @returns {{ lineItems: Array, totalHours: number, totalAmount: number }}
 */
function computeInvoiceTotals(lineItems) {
    const computed = lineItems.map(item => ({
        ...item,
        amount: Math.round((item.hours * item.rate) * 100) / 100
    }));
    const totalHours = computed.reduce((s, i) => s + i.hours, 0);
    const totalAmount = Math.round(computed.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    return { lineItems: computed, totalHours, totalAmount };
}

module.exports = { haversineDistance, isInsideGeofence, calculateWorkingDays, computeInvoiceTotals };
