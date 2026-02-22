// Water body thermal properties and characteristics
export const WATER_BODIES_V2 = {
    pond: {
        // Tuned for very small impoundments (roughly <= 5 acres)
        thermal_lag_days: 5,           // Responds quickly to weather
        seasonal_lag_days: 10,         // Peak temp lags solar by ~10 days
        annual_amplitude: 24,          // 24°F swing from winter to summer
        thermocline_depth: 8,          // Feet - where temp drops rapidly
        max_daily_change: 3,           // Max °F change per day
        deep_stable_temp: 55,          // Bottom temp in summer
        mixing_wind_threshold: 5,      // mph - when wind starts mixing layers
        wind_reduction_factor: 0.68,   // 0-1 sheltering factor for on-pond effective wind
        evaporation_multiplier: 0.85   // Scales latent heat/evaporative cooling intensity
    },
    lake: {
        thermal_lag_days: 10,
        seasonal_lag_days: 25,
        annual_amplitude: 20,
        thermocline_depth: 15,
        max_daily_change: 2,
        deep_stable_temp: 50,
        mixing_wind_threshold: 8,
        wind_reduction_factor: 0.8,
        evaporation_multiplier: 1
    },
    reservoir: {
        thermal_lag_days: 14,
        seasonal_lag_days: 35,
        annual_amplitude: 18,
        thermocline_depth: 25,
        max_daily_change: 1.5,
        deep_stable_temp: 45,
        mixing_wind_threshold: 10,
        wind_reduction_factor: 0.9,
        evaporation_multiplier: 1
    }
};
