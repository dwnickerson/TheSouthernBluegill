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

export function getNoaaRadarImageUrl({ lat, lon, width = 1024, height = 512, spanDegrees = 4, timestampMs = Date.now() }) {
    const normalizedCoords = getNormalizedCoords(lat, lon);
    if (!normalizedCoords) {
        return '';
    }

    const { latClamped, lonClamped } = normalizedCoords;
    const halfSpan = Math.max(0.5, Number(spanDegrees) / 2);
    const minLat = Math.max(-85, latClamped - halfSpan);
    const maxLat = Math.min(85, latClamped + halfSpan);
    const minLon = Math.max(-180, lonClamped - halfSpan);
    const maxLon = Math.min(180, lonClamped + halfSpan);
    const bbox = [minLon, minLat, maxLon, maxLat].map((value) => value.toFixed(4)).join(',');

    const cacheBust = Number.isFinite(Number(timestampMs)) ? Number(timestampMs) : Date.now();
    return `https://nowcoast.noaa.gov/arcgis/rest/services/nowcoast/radar_meteo_imagery_nexrad_time/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${Math.round(width)}%2C${Math.round(height)}&format=png32&transparent=true&f=image&time=${cacheBust}`;
}

export function getOpenStreetMapTileUrl({ lat, lon, zoom = 6 }) {
    const normalizedCoords = getNormalizedCoords(lat, lon);
    if (!normalizedCoords) {
        return '';
    }

    const { latClamped, lonClamped } = normalizedCoords;
    const x = Math.floor(((lonClamped + 180) / 360) * (2 ** zoom));
    const latRad = (latClamped * Math.PI) / 180;
    const n = Math.PI - (2 * Math.PI * Math.log(Math.tan((Math.PI / 4) + (latRad / 2)))) / (2 * Math.PI);
    const y = Math.floor((n / Math.PI) * (2 ** (zoom - 1)));
    return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}
