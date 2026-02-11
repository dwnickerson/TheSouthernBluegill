// Water body thermal properties and characteristics
export const WATER_BODIES_V2 = {
    pond: {
        thermal_lag_days: 5,           // Responds quickly to weather
        seasonal_lag_days: 10,         // Peak temp lags solar by ~10 days
        annual_amplitude: 24,          // 24°F swing from winter to summer
        thermocline_depth: 8,          // Feet - where temp drops rapidly
        max_daily_change: 3,           // Max °F change per day
        deep_stable_temp: 55,          // Bottom temp in summer
        mixing_wind_threshold: 5       // mph - when wind starts mixing layers
    },
    lake: {
        thermal_lag_days: 10,
        seasonal_lag_days: 25,
        annual_amplitude: 20,
        thermocline_depth: 15,
        max_daily_change: 2,
        deep_stable_temp: 50,
        mixing_wind_threshold: 8
    },
    reservoir: {
        thermal_lag_days: 14,
        seasonal_lag_days: 35,
        annual_amplitude: 18,
        thermocline_depth: 25,
        max_daily_change: 1.5,
        deep_stable_temp: 45,
        mixing_wind_threshold: 10
    }
};
