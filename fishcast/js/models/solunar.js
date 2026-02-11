// Solunar Calculations Model
// Calculates major and minor feeding periods based on moon position

export function calculateSolunar(lat, lon, date) {
    const julianDay = getJulianDay(date);
    
    // Moon phase calculation
    const moonAge = (julianDay - 2451550.1) % 29.530588853;
    const moonPhase = moonAge / 29.530588853;
    
    let phaseDescription = '';
    if (moonPhase < 0.03 || moonPhase > 0.97) phaseDescription = 'New Moon';
    else if (moonPhase < 0.22) phaseDescription = 'Waxing Crescent';
    else if (moonPhase < 0.28) phaseDescription = 'First Quarter';
    else if (moonPhase < 0.47) phaseDescription = 'Waxing Gibbous';
    else if (moonPhase < 0.53) phaseDescription = 'Full Moon';
    else if (moonPhase < 0.72) phaseDescription = 'Waning Gibbous';
    else if (moonPhase < 0.78) phaseDescription = 'Last Quarter';
    else phaseDescription = 'Waning Crescent';
    
    // Moon transit and underfoot times (simplified calculation)
    const moonTransit = calculateMoonTransit(julianDay, lon);
    const moonUnderfoot = (moonTransit + 12) % 24;
    
    // Major periods (2-3 hours, centered on moon transit and underfoot)
    const major1Start = (moonTransit - 1.5 + 24) % 24;
    const major1End = (moonTransit + 1.5) % 24;
    const major2Start = (moonUnderfoot - 1.5 + 24) % 24;
    const major2End = (moonUnderfoot + 1.5) % 24;
    
    // Minor periods (1-2 hours, moon rise and set)
    const moonRise = (moonTransit - 6 + 24) % 24;
    const moonSet = (moonTransit + 6) % 24;
    const minor1Start = (moonRise - 0.5 + 24) % 24;
    const minor1End = (moonRise + 0.5) % 24;
    const minor2Start = (moonSet - 0.5 + 24) % 24;
    const minor2End = (moonSet + 0.5) % 24;
    
    return {
        moon_phase: phaseDescription,
        moon_phase_percent: Math.round(moonPhase * 100),
        major_periods: [
            formatPeriod(major1Start, major1End),
            formatPeriod(major2Start, major2End)
        ],
        minor_periods: [
            formatPeriod(minor1Start, minor1End),
            formatPeriod(minor2Start, minor2End)
        ]
    };
}

function getJulianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
}

function calculateMoonTransit(julianDay, lon) {
    // Simplified moon transit calculation
    const moonLongitude = (218.316 + 13.176396 * (julianDay - 2451545)) % 360;
    const transitHour = ((moonLongitude - lon + 360) % 360) / 15;
    return transitHour;
}

function formatPeriod(start, end) {
    const formatHour = (h) => {
        const hour = Math.floor(h) % 24;
        const minute = Math.round((h % 1) * 60);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
    };
    
    return `${formatHour(start)} - ${formatHour(end)}`;
}
