// Species data and biological parameters
export const SPECIES_DATA = {
    bass: {
        name: "Largemouth Bass",
        phases: {
            winter: { temp_range: [35, 48], score_bonus: -10 },
            pre_spawn: { temp_range: [48, 58], score_bonus: 20 },
            spawn: { temp_range: [58, 70], score_bonus: 30 },
            post_spawn: { temp_range: [70, 75], score_bonus: -5 },
            early_summer: { temp_range: [75, 80], score_bonus: 18 },
            summer: { temp_range: [80, 88], score_bonus: 12 },
            fall: { temp_range: [58, 72], score_bonus: 25 }
        },
        preferences: {
            wind_ideal: [5, 15],
            loves_light_rain: true,
            overcast_bonus: 8
        }
    },
    crappie: {
        name: "Crappie",
        phases: {
            winter: { temp_range: [32, 45], score_bonus: -5 },
            pre_spawn: { temp_range: [45, 55], score_bonus: 15 },
            spawn: { temp_range: [55, 65], score_bonus: 30 },
            post_spawn: { temp_range: [65, 70], score_bonus: 5 },
            summer: { temp_range: [70, 85], score_bonus: 8 },
            fall: { temp_range: [55, 70], score_bonus: 18 }
        },
        preferences: {
            loves_overcast: true,
            loves_calm: true,
            pressure_sensitive: 40
        }
    },
    bluegill: {
        name: "Bluegill",
        phases: {
            inactive: { temp_range: [0, 45], score_bonus: -15 },
            cold: { temp_range: [45, 55], score_bonus: 5 },
            pre_spawn: { temp_range: [55, 67], score_bonus: 18 },
            spawn: { temp_range: [67, 74], score_bonus: 25 },
            post_spawn: { temp_range: [74, 80], score_bonus: 12 },
            summer: { temp_range: [80, 100], score_bonus: 10 }
        },
        preferences: {
            spawn_needs_sun: true
        }
    }
};
