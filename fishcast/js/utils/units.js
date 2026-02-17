export function toWindMph(value, unitHint = '') {
    if (!Number.isFinite(value)) return null;
    const normalizedUnit = String(unitHint || '').toLowerCase();

    if (normalizedUnit.includes('mph') || normalizedUnit.includes('mp/h') || normalizedUnit.includes('mi/h') || normalizedUnit.includes('mile')) {
        return value;
    }
    if (normalizedUnit.includes('m/s') || normalizedUnit.includes('ms')) {
        return value * 2.23694;
    }
    if (normalizedUnit.includes('kn')) {
        return value * 1.15078;
    }
    if (normalizedUnit.includes('km') || normalizedUnit.includes('kph')) {
        return value * 0.621371;
    }

    return value;
}
