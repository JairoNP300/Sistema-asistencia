/**
 * QR-Asistencia — Utilidades de verificación Jibble
 * Funciones puras: haversine, geofencing, días hábiles, totales de factura
 */

/**
 * Calcula la distancia en metros entre dos coordenadas usando la fórmula haversine.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distancia en metros
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // radio de la Tierra en metros
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Determina si un punto GPS está dentro de un geofence.
 * @param {{ lat: number, lon: number }} geoPoint
 * @param {{ lat: number, lon: number, radiusMeters: number }} geofence
 * @returns {boolean}
 */
function isInsideGeofence(geoPoint, geofence) {
    if (!geoPoint || !geofence) return false;
    const dist = haversineDistance(geoPoint.lat, geoPoint.lon, geofence.lat, geofence.lon);
    return dist <= geofence.radiusMeters;
}

/**
 * Calcula el número de días hábiles (lunes–viernes) entre dos fechas, inclusive.
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {number}
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
 * Calcula los totales de una factura a partir de sus líneas.
 * @param {Array<{ hours: number, rate: number }>} lineItems
 * @param {number} defaultRate  tarifa por defecto si lineItem.rate no está definido
 * @returns {{ lineItems: Array, totalHours: number, totalAmount: number }}
 */
function computeInvoiceTotals(lineItems, defaultRate = 0) {
    let totalHours = 0;
    let totalAmount = 0;
    const computed = (lineItems || []).map(item => {
        const rate = item.rate != null ? item.rate : defaultRate;
        const amount = (item.hours || 0) * rate;
        totalHours += item.hours || 0;
        totalAmount += amount;
        return { ...item, rate, amount };
    });
    return { lineItems: computed, totalHours, totalAmount };
}

module.exports = { haversineDistance, isInsideGeofence, calculateWorkingDays, computeInvoiceTotals };
