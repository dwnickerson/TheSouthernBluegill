function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function finiteOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

function firstFinite(...vals) {
  for (const v of vals) {
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export function buildUrls({ lat, lon, pastDays, futureDays }) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const pastStart = new Date(yesterday.getTime() - (pastDays - 1) * 24 * 3600 * 1000);
  const futureEnd = new Date(now.getTime() + futureDays * 24 * 3600 * 1000);

  const varsDaily = [
    'temperature_2m_max',
    'temperature_2m_min',
    'temperature_2m_mean',
    'relative_humidity_2m_mean',
    'precipitation_sum',
    'windspeed_10m_mean',
    'shortwave_radiation_sum',
    'cloudcover_mean'
  ].join(',');

  const varsCurrent = ['temperature_2m', 'relative_humidity_2m', 'windspeed_10m', 'cloudcover'].join(',');

  const forecast = new URL('https://api.open-meteo.com/v1/forecast');
  forecast.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: varsDaily,
    current: varsCurrent,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    start_date: toISODate(now),
    end_date: toISODate(futureEnd)
  }).toString();

  const archive = new URL('https://archive-api.open-meteo.com/v1/archive');
  archive.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: varsDaily,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    start_date: toISODate(pastStart),
    end_date: toISODate(yesterday)
  }).toString();

  return { forecast: forecast.toString(), archive: archive.toString() };
}

export function buildSeries(archive, forecast) {
  const mapDaily = (payload, source) => payload.daily.time.map((date, i) => {
    const tMax = finiteOrNull(payload.daily.temperature_2m_max[i]);
    const tMin = finiteOrNull(payload.daily.temperature_2m_min[i]);
    const tMeanRaw = finiteOrNull(payload.daily.temperature_2m_mean[i]);
    const tMeanFallback = (Number.isFinite(tMax) && Number.isFinite(tMin)) ? (tMax + tMin) / 2 : null;
    const windRaw = finiteOrNull(payload.daily.windspeed_10m_mean[i]);
    const humidityRaw = finiteOrNull(payload.daily.relative_humidity_2m_mean[i]);
    const precipRaw = finiteOrNull(payload.daily.precipitation_sum[i]);
    const solarRaw = finiteOrNull(payload.daily.shortwave_radiation_sum[i]);
    const cloudRaw = finiteOrNull(payload.daily.cloudcover_mean[i]);

    return {
      date,
      source,
      tMax,
      tMin,
      tMean: firstFinite(tMeanRaw, tMeanFallback),
      humidityMean: clamp(firstFinite(humidityRaw, payload.current?.relative_humidity_2m, 65), 0, 100),
      precip: firstFinite(precipRaw, 0),
      windMean: firstFinite(windRaw, 0),
      solar: firstFinite(solarRaw, 0),
      cloud: clamp(firstFinite(cloudRaw, 0), 0, 100)
    };
  });

  return [...mapDaily(archive, 'past'), ...mapDaily(forecast, 'future_or_today')];
}
