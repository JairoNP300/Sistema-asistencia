/**
 * Utilidades para cálculo de deducciones de El Salvador
 * Decreto Ejecutivo 95 y Artículo 37 Ley del Impuesto sobre la Renta
 */

// Tablas de retención según las imágenes proporcionadas
const RETENTION_TABLES = {
    // Tabla Mensual
    monthly: [
        { from: 0, to: 472.00, fixedFee: 0, rate: 0, excessOver: 0 },
        { from: 472.01, to: 895.24, fixedFee: 17.67, rate: 0.10, excessOver: 472.00 },
        { from: 895.25, to: 2038.10, fixedFee: 60.00, rate: 0.20, excessOver: 895.24 },
        { from: 2038.11, to: Infinity, fixedFee: 288.57, rate: 0.30, excessOver: 2038.10 }
    ],
    // Tabla Quincenal
    biweekly: [
        { from: 0, to: 236.00, fixedFee: 0, rate: 0, excessOver: 0 },
        { from: 236.01, to: 447.62, fixedFee: 8.83, rate: 0.10, excessOver: 236.00 },
        { from: 447.63, to: 1019.05, fixedFee: 30.00, rate: 0.20, excessOver: 447.62 },
        { from: 1019.06, to: Infinity, fixedFee: 144.28, rate: 0.30, excessOver: 1019.05 }
    ],
    // Tabla Semanal
    weekly: [
        { from: 0, to: 118.00, fixedFee: 0, rate: 0, excessOver: 0 },
        { from: 118.01, to: 223.81, fixedFee: 4.42, rate: 0.10, excessOver: 118.00 },
        { from: 223.82, to: 509.52, fixedFee: 15.00, rate: 0.20, excessOver: 223.81 },
        { from: 509.53, to: Infinity, fixedFee: 72.14, rate: 0.30, excessOver: 509.52 }
    ]
};

// Porcentajes de retención ISSS y AFP
const RETENTION_PERCENTAGES = {
    isss: 0.03,  // 3.00%
    afp: 0.0725  // 7.25%
};

// Tope ISSS según tipo
const ISSS_CAPS = {
    monthly: 30.00,    // Mensual $30
    biweekly: 15.00,   // Quincenal $15
    weekly: 7.50     // Semanal $7.50
};

/**
 * Calcula la retención de RENTA según el salario y período
 * @param {number} salary - Salario a calcular
 * @param {string} period - 'monthly', 'biweekly', 'weekly'
 * @returns {number} - Retención de renta calculada
 */
function calculateRenta(salary, period = 'monthly') {
    const table = RETENTION_TABLES[period];
    if (!table) return 0;

    // Encontrar el tramo correspondiente
    const bracket = table.find(b => salary >= b.from && salary <= b.to);
    if (!bracket || bracket.rate === 0) return 0;

    // Calcular: Cuota fija + (exceso × tasa)
    const excess = salary - bracket.excessOver;
    const renta = bracket.fixedFee + (excess * bracket.rate);
    
    return Math.max(0, renta);
}

/**
 * Calcula la retención de ISSS
 * @param {number} salary - Salario a calcular
 * @param {string} period - 'monthly', 'biweekly', 'weekly'
 * @returns {number} - Retención de ISSS calculada
 */
function calculateISSS(salary, period = 'monthly') {
    const isss = salary * RETENTION_PERCENTAGES.isss;
    const cap = ISSS_CAPS[period] || ISSS_CAPS.monthly;
    return Math.min(isss, cap);
}

/**
 * Calcula la retención de AFP
 * @param {number} salary - Salario a calcular
 * @returns {number} - Retención de AFP calculada
 */
function calculateAFP(salary) {
    return salary * RETENTION_PERCENTAGES.afp;
}

/**
 * Calcula todas las deducciones para un salario
 * @param {number} salary - Salario bruto
 * @param {string} period - 'monthly', 'biweekly', 'weekly'
 * @returns {object} - Objeto con todas las deducciones
 */
function calculateAllDeductions(salary, period = 'monthly') {
    const isss = calculateISSS(salary, period);
    const afp = calculateAFP(salary);
    const renta = calculateRenta(salary, period);
    const totalDeductions = isss + afp + renta;
    const netSalary = salary - totalDeductions;

    return {
        grossSalary: salary,
        isss: Math.round(isss * 100) / 100,
        afp: Math.round(afp * 100) / 100,
        renta: Math.round(renta * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        netSalary: Math.round(netSalary * 100) / 100
    };
}

/**
 * Calcula salario proporcional según días trabajados
 * @param {number} monthlySalary - Salario mensual base
 * @param {number} workedDays - Días trabajados
 * @param {number} daysInPeriod - Días en el período (30 mensual, 15 quincenal, 7 semanal)
 * @returns {number} - Salario proporcional
 */
function calculateProportionalSalary(monthlySalary, workedDays, daysInPeriod = 30) {
    const dailyRate = monthlySalary / 30;
    return dailyRate * workedDays;
}

/**
 * Obtiene información del tramo de retención aplicable
 * @param {number} salary - Salario
 * @param {string} period - 'monthly', 'biweekly', 'weekly'
 * @returns {object} - Información del tramo
 */
function getRetentionBracket(salary, period = 'monthly') {
    const table = RETENTION_TABLES[period];
    if (!table) return null;
    
    return table.find(b => salary >= b.from && salary <= b.to) || table[table.length - 1];
}

module.exports = {
    calculateRenta,
    calculateISSS,
    calculateAFP,
    calculateAllDeductions,
    calculateProportionalSalary,
    getRetentionBracket,
    RETENTION_TABLES,
    RETENTION_PERCENTAGES,
    ISSS_CAPS
};
