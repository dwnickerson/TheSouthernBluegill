export function getRadarEmbedUrl(lat, lon) {
    const latProvided = lat !== null && lat !== undefined && String(lat).trim() !== '';
    const lonProvided = lon !== null && lon !== undefined && String(lon).trim() !== '';
    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (!latProvided || !lonProvided || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
        if (typeof console !== 'undefined') {
            console.warn('[FishCast] Invalid radar coordinates; skipping radar embed.', { lat, lon });
        }
        return '';
    }

    const latClamped = Math.max(-90, Math.min(90, latNum));
    const lonClamped = Math.max(-180, Math.min(180, lonNum));
    const zoom = 7;

    return `https://embed.windy.com/embed2.html?lat=${latClamped.toFixed(4)}&lon=${lonClamped.toFixed(4)}&detailLat=${latClamped.toFixed(4)}&detailLon=${lonClamped.toFixed(4)}&width=650&height=450&zoom=${zoom}&level=surface&overlay=radar&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=true&type=map&location=coordinates&detail=true&metricWind=mph&metricTemp=%C2%B0F`;
}
