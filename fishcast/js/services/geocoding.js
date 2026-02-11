// Geocoding service for location lookup
import { API_CONFIG } from '../config/constants.js';

function parseLocation(input) {
    input = input.trim();
    
    // Check if ZIP code
    const zipPattern = /^\d{5}$/;
    if (zipPattern.test(input)) {
        return { type: 'zip', value: input };
    }
    
    // Check if "City, State" format
    if (input.includes(',')) {
        const parts = input.split(',').map(s => s.trim());
        if (parts.length === 2) {
            return { type: 'city_state', city: parts[0], state: parts[1] };
        }
    }
    
    // Check if "City ST" format (two letter state code at end)
    const words = input.split(/\s+/);
    if (words.length >= 2) {
        const possibleState = words[words.length - 1].toUpperCase();
        if (possibleState.length === 2) {
            const city = words.slice(0, -1).join(' ');
            return { type: 'city_state', city: city, state: possibleState };
        }
    }
    
    // Fallback to city only
    return { type: 'city_only', value: input };
}

export async function getLocation(locationInput) {
    const parsed = parseLocation(locationInput);
    const baseUrl = API_CONFIG.GEOCODING.NOMINATIM_URL;
    const headers = { 'User-Agent': API_CONFIG.GEOCODING.USER_AGENT };
    
    let url;
    let displayName;
    
    if (parsed.type === 'zip') {
        url = `${baseUrl}?postalcode=${parsed.value}&country=US&format=json&limit=1`;
        
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        if (data && data.length > 0) {
            const parts = data[0].display_name.split(', ');
            const cityName = parts[0];
            const stateName = parts.length > 2 ? parts[parts.length - 2] : 'US';
            
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                name: `${cityName}, ${stateName}`
            };
        }
        throw new Error(`ZIP code ${parsed.value} not found`);
    }
    
    if (parsed.type === 'city_state') {
        url = `${baseUrl}?q=${parsed.city},${parsed.state},US&format=json&limit=1`;
        
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                name: `${parsed.city}, ${parsed.state}`
            };
        }
        throw new Error(`Location "${parsed.city}, ${parsed.state}" not found. Please check spelling.`);
    }
    
    if (parsed.type === 'city_only') {
        url = `${baseUrl}?q=${parsed.value},US&format=json&limit=1`;
        
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                name: data[0].display_name
            };
        }
        throw new Error(`Location "${parsed.value}" not found. Try: "City, State" or ZIP code.`);
    }
    
    throw new Error('Invalid location format. Use "City, State" or ZIP code.');
}
