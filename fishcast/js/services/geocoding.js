// Geocoding service for location lookup
import { API_CONFIG } from '../config/constants.js';
import { storage } from './storage.js';

const RETRY_DELAYS_MS = [400, 900];
const GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function normalizeLocationKey(input) {
    return input.trim().toLowerCase();
}

function getCachedLocation(input) {
    const cache = storage.getGeocodeCache();
    const key = normalizeLocationKey(input);
    const entry = cache[key];

    if (!entry) {
        return null;
    }

    if (!entry.savedAt || Date.now() - entry.savedAt > GEOCODE_CACHE_TTL_MS) {
        return null;
    }

    return entry.value;
}

function cacheLocation(input, value) {
    const cache = storage.getGeocodeCache();
    const key = normalizeLocationKey(input);
    cache[key] = {
        savedAt: Date.now(),
        value
    };
    storage.setGeocodeCache(cache);
}

async function fetchWithRetry(url, headers, resourceName) {
    let lastError;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`${resourceName} request failed (${response.status})`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < RETRY_DELAYS_MS.length) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
            }
        }
    }

    throw lastError;
}

export async function getLocation(locationInput) {
    const parsed = parseLocation(locationInput);
    const baseUrl = API_CONFIG.GEOCODING.NOMINATIM_URL;
    const headers = { 'User-Agent': API_CONFIG.GEOCODING.USER_AGENT };

    let url;

    if (parsed.type === 'zip') {
        url = `${baseUrl}?postalcode=${parsed.value}&country=US&format=json&limit=1`;

        try {
            const data = await fetchWithRetry(url, headers, 'Geocoding');

            if (data && data.length > 0) {
                const parts = data[0].display_name.split(', ');
                const cityName = parts[0];
                const stateName = parts.length > 2 ? parts[parts.length - 2] : 'US';

                const result = {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    name: `${cityName}, ${stateName}`
                };
                cacheLocation(locationInput, result);
                return result;
            }
            throw new Error(`ZIP code ${parsed.value} not found`);
        } catch (error) {
            const cached = getCachedLocation(locationInput);
            if (cached) {
                return {
                    ...cached,
                    stale: true,
                    staleReason: 'Using saved location due to geocoding outage.'
                };
            }
            throw error;
        }
    }

    if (parsed.type === 'city_state') {
        url = `${baseUrl}?q=${encodeURIComponent(`${parsed.city},${parsed.state},US`)}&format=json&limit=1`;

        try {
            const data = await fetchWithRetry(url, headers, 'Geocoding');

            if (data && data.length > 0) {
                const result = {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    name: `${parsed.city}, ${parsed.state}`
                };
                cacheLocation(locationInput, result);
                return result;
            }
            throw new Error(`Location "${parsed.city}, ${parsed.state}" not found. Please check spelling.`);
        } catch (error) {
            const cached = getCachedLocation(locationInput);
            if (cached) {
                return {
                    ...cached,
                    stale: true,
                    staleReason: 'Using saved location due to geocoding outage.'
                };
            }
            throw error;
        }
    }

    if (parsed.type === 'city_only') {
        url = `${baseUrl}?q=${encodeURIComponent(`${parsed.value},US`)}&format=json&limit=1`;

        try {
            const data = await fetchWithRetry(url, headers, 'Geocoding');

            if (data && data.length > 0) {
                const result = {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    name: data[0].display_name
                };
                cacheLocation(locationInput, result);
                return result;
            }
            throw new Error(`Location "${parsed.value}" not found. Try: "City, State" or ZIP code.`);
        } catch (error) {
            const cached = getCachedLocation(locationInput);
            if (cached) {
                return {
                    ...cached,
                    stale: true,
                    staleReason: 'Using saved location due to geocoding outage.'
                };
            }
            throw error;
        }
    }

    throw new Error('Invalid location format. Use "City, State" or ZIP code.');
}
