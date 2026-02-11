// Temperature and unit conversions
export function cToF(celsius) {
    return (celsius * 9/5) + 32;
}

export function fToC(fahrenheit) {
    return (fahrenheit - 32) * 5/9;
}

export function kmhToMph(kmh) {
    return kmh * 0.621371;
}

export function mphToKmh(mph) {
    return mph / 0.621371;
}

// Distance calculation (Haversine formula)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Wind direction from degrees
export function getWindDirection(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degrees / 45) % 8];
}
