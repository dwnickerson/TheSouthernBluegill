// Geocoding service for location lookup
import { API_CONFIG } from '../config/constants.js';
import { storage } from './storage.js';

const GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;

function parseLocation(input) {
    input = input.trim();

    const zipPattern = /^\d{5}$/;
    if (zipPattern.test(input)) {
        return { type: 'zip', value: input };
    }

    if (input.includes(',')) {
        const parts = input.split(',').map(s => s.trim());
        if (parts.length === 2) {
            return { type: 'city_state', city: parts[0], state: parts[1] };
        }
    }

    const words = input.split(/\s+/);
    if (words.length >= 2) {
        const possibleState = words[words.length - 1].toUpperCase();
        if (possibleState.length === 2) {
            const city = words.slice(0, -1).join(' ');
            return { type: 'city_state', city: city, state: possibleState };
        }
    }

    return { type: 'city_only', value: input };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, headers) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`Geocoding request failed (${response.status})`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS) {
                await delay(300 * attempt);
            }
        }
    }
    throw lastError;
}

function normalizeResult(parsed, data) {
    if (!data || data.length === 0) {
        return null;
    }

    if (parsed.type === 'zip') {
        const parts = data[0].display_name.split(', ');
        const cityName = parts[0];
        const stateName = parts.length > 2 ? parts[parts.length - 2] : 'US';
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            name: `${cityName}, ${stateName}`
        };
    }

    if (parsed.type === 'city_state') {
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            name: `${parsed.city}, ${parsed.state}`
        };
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        name: data[0].display_name
    };
}

function getQueryUrl(parsed, baseUrl) {
    if (parsed.type === 'zip') {
        return `${baseUrl}?postalcode=${parsed.value}&country=US&format=json&limit=1`;
    }
    if (parsed.type === 'city_state') {
        return `${baseUrl}?q=${parsed.city},${parsed.state},US&format=json&limit=1`;
    }
    if (parsed.type === 'city_only') {
        return `${baseUrl}?q=${parsed.value},US&format=json&limit=1`;
    }
    throw new Error('Invalid location format. Use "City, State" or ZIP code.');
}

function getNotFoundError(parsed) {
    if (parsed.type === 'zip') {
        return new Error(`ZIP code ${parsed.value} not found`);
    }
    if (parsed.type === 'city_state') {
        return new Error(`Location "${parsed.city}, ${parsed.state}" not found. Please check spelling.`);
    }
    return new Error(`Location "${parsed.value}" not found. Try: "City, State" or ZIP code.`);
}

export async function getLocation(locationInput) {
    const normalizedInput = locationInput.trim();
    const cached = storage.getGeocodeCache(normalizedInput);
    const now = Date.now();

    if (cached?.coords && cached.cachedAt && (now - cached.cachedAt) <= GEOCODE_TTL_MS) {
        return { ...cached.coords, stale: false, fromCache: true };
    }

    const parsed = parseLocation(normalizedInput);
    const baseUrl = API_CONFIG.GEOCODING.NOMINATIM_URL;
    const headers = { 'User-Agent': API_CONFIG.GEOCODING.USER_AGENT };

    try {
        const url = getQueryUrl(parsed, baseUrl);
        const data = await fetchWithRetry(url, headers);
        const coords = normalizeResult(parsed, data);
        if (!coords) {
            throw getNotFoundError(parsed);
        }

        storage.setGeocodeCache(normalizedInput, {
            coords,
            cachedAt: now
        });

        return { ...coords, stale: false, fromCache: false };
    } catch (error) {
        if (cached?.coords) {
            return {
                ...cached.coords,
                stale: true,
                staleReason: `Geocoding fallback: ${error.message}`,
                staleAt: cached.cachedAt || null,
                fromCache: true
            };
        }
        throw error;
    }
}
