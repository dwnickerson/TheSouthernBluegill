function toTileX(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * (2 ** zoom));
}

function toTileY(lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    const n = Math.PI - (2 * Math.PI * Math.log(Math.tan((Math.PI / 4) + (latRad / 2)))) / (2 * Math.PI);
    return Math.floor((n / Math.PI) * (2 ** (zoom - 1)));
}

function getNormalizedCoords(lat, lon) {
    const latProvided = lat !== null && lat !== undefined && String(lat).trim() !== '';
    const lonProvided = lon !== null && lon !== undefined && String(lon).trim() !== '';
    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (!latProvided || !lonProvided || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
        if (typeof console !== 'undefined') {
            console.warn('[FishCast] Invalid radar coordinates; skipping radar embed.', { lat, lon });
        }
        return null;
    }

    const latClamped = Math.max(-85, Math.min(85, latNum));
    const lonClamped = Math.max(-180, Math.min(180, lonNum));
    return { latClamped, lonClamped };
}

export function getRainViewerMetadataUrl() {
    return 'https://api.rainviewer.com/public/weather-maps.json';
}

export function getRainViewerTileUrl({ lat, lon, framePath, zoom = 6, tileSize = 512, colorScheme = 4, smooth = 1, snow = 1 }) {
    const normalizedCoords = getNormalizedCoords(lat, lon);
    if (!normalizedCoords || !framePath) {
        return '';
    }

    const { latClamped, lonClamped } = normalizedCoords;
    const normalizedFramePath = String(framePath).startsWith('/') ? framePath : `/${framePath}`;
    const x = toTileX(lonClamped, zoom);
    const y = toTileY(latClamped, zoom);

    return `https://tilecache.rainviewer.com${normalizedFramePath}/${tileSize}/${zoom}/${x}/${y}/${colorScheme}/${smooth}_${snow}.png`;
}

export function getOpenStreetMapTileUrl({ lat, lon, zoom = 6 }) {
    const normalizedCoords = getNormalizedCoords(lat, lon);
    if (!normalizedCoords) {
        return '';
    }

    const { latClamped, lonClamped } = normalizedCoords;
    const x = toTileX(lonClamped, zoom);
    const y = toTileY(latClamped, zoom);
    return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}
