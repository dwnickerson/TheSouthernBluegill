import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateFishingScore,
    getFishPhase,
    getMoonPhaseBonus
} from './fishingScore.js';
import { SPECIES_DATA } from '../config/species.js';

function buildWeather({
    pressures,
    pressureTimes,
    cloudCover = 85,
    windKmh = 10,
    weatherCode = 1,
    precipDaily = [0, 0, 0],
    precipProb = 20,
    windUnits = 'kmh'
}) {
    return {
        current: {
            wind_speed_10m: windKmh,
            cloud_cover: cloudCover,
            weather_code: weatherCode
        },
        current_units: {
            wind_speed_10m: windUnits
        },
        daily: {
            precipitation_sum: precipDaily
        },
        hourly: {
            time: pressureTimes,
            surface_pressure: pressures,
            precipitation_probability: [precipProb]
        }
    };
}

function pastHours(count) {
    const now = Date.now();
    const items = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        items.push(new Date(now - i * 60 * 60 * 1000).toISOString());
    }
    return items;
}

test('spawn-only cloud rule does not trigger for pre_spawn or post_spawn', () => {
    const pressures = [1018, 1017, 1016, 1016, 1015, 1015, 1014, 1014, 1013, 1013, 1012];
    const pressureTimes = pastHours(11);
    const weather = buildWeather({ pressures, pressureTimes, cloudCover: 90 });

    const preSpawn = calculateFishingScore(weather, 60, 'bluegill', 50);
    const postSpawn = calculateFishingScore(weather, 82, 'bluegill', 50);
    const spawn = calculateFishingScore(weather, 70, 'bluegill', 50);

    assert.equal(preSpawn.phase, 'pre_spawn');
    assert.equal(postSpawn.phase, 'post_spawn');
    assert.equal(spawn.phase, 'spawn');

    const hasSpawnCloudPenalty = (result) => result.factors.some((f) => f.name === 'Heavy cloud cover during spawn');

    assert.equal(hasSpawnCloudPenalty(preSpawn), false);
    assert.equal(hasSpawnCloudPenalty(postSpawn), false);
    assert.equal(hasSpawnCloudPenalty(spawn), true);
});

test('phase overlap resolves by explicit priority', () => {
    const phase = getFishPhase(72, SPECIES_DATA.bass);
    assert.equal(phase.name, 'post_spawn');
});

test('pressure effect is capped and does not exceed ±18', () => {
    const pressures = [1035, 1030, 1025, 1020, 1015, 1010, 1006, 1002, 998, 994, 990];
    const weather = buildWeather({ pressures, pressureTimes: pastHours(11), cloudCover: 40 });
    const result = calculateFishingScore(weather, 65, 'bass', 50);
    const pressureFactor = result.factors.find((f) => f.name.startsWith('Pressure'));

    assert.ok(pressureFactor, 'expected pressure factor to be present');
    assert.ok(Math.abs(pressureFactor.value) <= 18, `pressure effect exceeded cap: ${pressureFactor.value}`);
});

test('moon bonus is smooth and capped at 0-5 by default', () => {
    const low = getMoonPhaseBonus(50, 'bass');
    const nearPeakA = getMoonPhaseBonus(94, 'bass');
    const nearPeakB = getMoonPhaseBonus(96, 'bass');
    const peak = getMoonPhaseBonus(100, 'bass');

    assert.ok(low >= 0 && low <= 5);
    assert.ok(nearPeakA >= 0 && nearPeakA <= 5);
    assert.ok(nearPeakB >= 0 && nearPeakB <= 5);
    assert.ok(peak >= 0 && peak <= 5);
    assert.ok(Math.abs(nearPeakA - nearPeakB) < 1, 'moon curve appears to have step jump near peak');
});

test('score always bounded [0,100] and never NaN', () => {
    const weather = buildWeather({
        pressures: [900, 930, 960, 990, 1020, 1050, 1080, 1110, 1140, 1170, 1200],
        pressureTimes: pastHours(11),
        cloudCover: 100,
        weatherCode: 99,
        precipDaily: [80, 80, 80],
        precipProb: 100,
        windKmh: 80
    });

    const result = calculateFishingScore(weather, 35, 'smallmouth', 0);
    assert.ok(Number.isFinite(result.score));
    assert.ok(result.score >= 0 && result.score <= 100);
});


test('wind units that include mp/h are treated as mph without reconversion', () => {
    const weather = buildWeather({
        pressures: [1016, 1016, 1015, 1015, 1014, 1014, 1014, 1013, 1013, 1013, 1012],
        pressureTimes: pastHours(11),
        windKmh: 6,
        windUnits: 'mp/h'
    });

    const result = calculateFishingScore(weather, 70, 'bluegill', 50);
    const windFactor = result.factors.find((factor) => factor.name.startsWith('Wind ('));

    assert.ok(windFactor, 'expected wind factor to be present');
    assert.match(windFactor.name, /Wind \(6\.0 mph\)/);
});
