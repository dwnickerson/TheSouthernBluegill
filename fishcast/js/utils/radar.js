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

export function getNoaaRadarImageUrl({ lat, lon, width = 1024, height = 512, spanDegrees = 4 }) {
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
    const bbox = [minLat, minLon, maxLat, maxLon].map((value) => value.toFixed(4)).join(',');

    return `https://nowcoast.noaa.gov/geoserver/observations_radar/ows?service=WMS&version=1.3.0&request=GetMap&layers=observations_radar_base_reflectivity&styles=&format=image/png&transparent=true&width=${Math.round(width)}&height=${Math.round(height)}&crs=EPSG:4326&bbox=${bbox}`;
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
