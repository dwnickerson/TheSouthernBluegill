import { estimateWaterTemp } from './waterTemp.js';
import { WATER_BODIES_V2 } from '../config/waterBodies.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const coords = { lat: 33.75, lon: -84.39 };
const currentDate = new Date('2026-05-15T12:00:00Z');
const baseDaily = {
    temperature_2m_mean: [70, 71, 72, 73, 74, 75, 76],
    cloud_cover_mean: [45, 45, 42, 40, 38, 35, 35],
    wind_speed_10m_mean: [7, 8, 7, 9, 8, 7, 8],
    wind_speed_10m_max: [14, 16, 15, 17, 18, 16, 17],
    precipitation_sum: [0, 0.1, 0, 0, 0.2, 0, 0]
};

const storageMemo = new Map();
globalThis.localStorage = {
    getItem: (k) => (storageMemo.has(k) ? storageMemo.get(k) : null),
    setItem: (k, v) => { storageMemo.set(k, String(v)); },
    removeItem: (k) => { storageMemo.delete(k); }
};

async function runScenario({ name, weather, reports, seedMemo, memoDayKey = null, memoModelVersion = null, waterType = 'lake' }) {
    storageMemo.clear();
    const memoKey = `fishcast_water_temp_memo_33.7500_-84.3900_${waterType}`;
    if (Number.isFinite(seedMemo)) {
        storageMemo.set(memoKey, JSON.stringify({ temp: seedMemo, dayKey: memoDayKey, modelVersion: memoModelVersion }));
    }

    globalThis.fetch = async () => ({ ok: true, json: async () => reports });
    const value = await estimateWaterTemp(coords, waterType, currentDate, weather);
    assert(Number.isFinite(value), `${name}: output must be finite`);
    assert(value >= 32 && value <= 95, `${name}: output must be plausible`);
    return value;
}

(async () => {
    const calm = await runScenario({
        name: 'calm',
        weather: { daily: { ...baseDaily, wind_speed_10m_mean: [4, 4, 5, 5, 4, 4, 5] }, forecast: { hourly: { wind_speed_10m: Array(72).fill(5) } }, meta: { nowHourIndex: 24 } },
        reports: [],
        waterType: 'lake'
    });

    const windy = await runScenario({
        name: 'windy',
        weather: { daily: { ...baseDaily, wind_speed_10m_mean: [18, 20, 22, 19, 21, 20, 19] }, forecast: { hourly: { wind_speed_10m: Array(72).fill(22) } }, meta: { nowHourIndex: 24 } },
        reports: [],
        waterType: 'lake'
    });
    assert(Math.abs(windy - calm) < 6, 'calm vs windy should not be unrealistic');

    const pondCloudy = await runScenario({
        name: 'pond-cloud',
        weather: { daily: { ...baseDaily, cloud_cover_mean: [85, 80, 82, 84, 86, 88, 84] } },
        reports: [],
        waterType: 'pond'
    });
    const reservoirCloudy = await runScenario({
        name: 'reservoir-cloud',
        weather: { daily: { ...baseDaily, cloud_cover_mean: [85, 80, 82, 84, 86, 88, 84] } },
        reports: [],
        waterType: 'reservoir'
    });
    assert(pondCloudy < reservoirCloudy || Math.abs(pondCloudy - reservoirCloudy) > 0.1, 'cloud effect should differ by water type');
    assert(Math.abs(pondCloudy - reservoirCloudy) < 20, 'cloud sensitivity should remain bounded across types');

    const nearThresholdTrend = await runScenario({
        name: 'trend-1',
        weather: { daily: { ...baseDaily, temperature_2m_mean: [70, 70.7, 71.4, 72.1, 72.8, 73.5, 74.2] } },
        reports: []
    });
    const aboveThresholdTrend = await runScenario({
        name: 'trend-2',
        weather: { daily: { ...baseDaily, temperature_2m_mean: [70, 71.1, 72.2, 73.3, 74.4, 75.5, 76.6] } },
        reports: []
    });
    assert(Math.abs(aboveThresholdTrend - nearThresholdTrend) < 5, 'trend kicker should change smoothly');

    const clamped = await runScenario({
        name: 'daily-clamp',
        weather: { daily: { ...baseDaily, temperature_2m_mean: [90, 91, 92, 93, 94, 95, 96] } },
        reports: [],
        seedMemo: 60,
        memoDayKey: '2026-05-15',
        memoModelVersion: '2.1.0'
    });
    const lakeMaxDaily = WATER_BODIES_V2.lake.max_daily_change;
    assert(Math.abs(clamped - 60) <= lakeMaxDaily + 0.05, 'daily clamp should hold without trusted reports');

    const relaxed = await runScenario({
        name: 'report-relaxed',
        weather: { daily: { ...baseDaily, temperature_2m_mean: [90, 91, 92, 93, 94, 95, 96] } },
        reports: [
            { latitude: 33.8, longitude: -84.3, timestamp: '2026-05-14T10:00:00Z', temperature: 74, waterBody: 'lake' },
            { latitude: 33.81, longitude: -84.31, timestamp: '2026-05-13T11:00:00Z', temperature: 75, waterBody: 'lake' }
        ],
        seedMemo: 60,
        memoDayKey: '2026-05-15',
        memoModelVersion: '2.1.0'
    });
    assert(relaxed >= clamped, 'trusted reports should slightly relax the clamp');
    assert(Math.abs(relaxed - 60) <= (lakeMaxDaily * 2) + 0.05, 'relaxed clamp must still be bounded');

    console.log('waterTemp smoke scenarios passed');
})();
