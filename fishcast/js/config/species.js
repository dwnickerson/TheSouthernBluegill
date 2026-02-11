// Complete Sunfish Family (Centrarchidae) - Scientifically Accurate Data
// Based on peer-reviewed research and state fisheries management data

export const SPECIES_DATA = {
    // ==================== TRUE SUNFISH (Lepomis) ====================
    
    bluegill: {
        name: "Bluegill",
        scientific: "Lepomis macrochirus",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [32, 45], score_bonus: -15 },
            cold_water: { temp_range: [45, 55], score_bonus: 5 },
            pre_spawn: { temp_range: [55, 67], score_bonus: 18 },
            spawn: { temp_range: [67, 80], score_bonus: 25 },      // Peak 70-75°F, multiple spawns
            post_spawn: { temp_range: [80, 88], score_bonus: 12 },
            fall: { temp_range: [55, 75], score_bonus: 15 }
        },
        preferences: {
            spawn_needs_sun: true,
            loves_calm: true,
            structure_oriented: true,
            moon_sensitive: true,          // Mass spawning on full moon
            insect_hatch_bonus: 15,
            schooling: true,
            depth_by_season: {
                spring: [2, 6],
                summer: [10, 20],          // Thermocline oriented
                fall: [5, 12],
                winter: [15, 30]
            }
        }
    },
    
    coppernose: {
        name: "Coppernose Bluegill",
        scientific: "Lepomis macrochirus purpurescens",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [32, 45], score_bonus: -15 },
            cold_water: { temp_range: [45, 55], score_bonus: 5 },
            pre_spawn: { temp_range: [55, 67], score_bonus: 20 },  // More aggressive
            spawn: { temp_range: [67, 80], score_bonus: 28 },      // Spawns 5-7 days earlier
            post_spawn: { temp_range: [80, 88], score_bonus: 15 },
            fall: { temp_range: [55, 75], score_bonus: 18 }
        },
        preferences: {
            spawn_needs_sun: true,
            loves_calm: true,
            structure_oriented: true,
            moon_sensitive: true,
            faster_growth: true,           // Management favorite
            more_aggressive: true,         // Key difference
            early_spawner: true,           // 5-7 days before regular bluegill
            schooling: true,
            depth_by_season: {
                spring: [2, 6],
                summer: [10, 20],
                fall: [5, 12],
                winter: [15, 30]
            }
        }
    },
    
    redear: {
        name: "Redear Sunfish (Shellcracker)",
        scientific: "Lepomis microlophus",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [35, 48], score_bonus: -10 },  // More cold-tolerant
            cold_water: { temp_range: [48, 58], score_bonus: 8 },
            pre_spawn: { temp_range: [58, 68], score_bonus: 20 },
            spawn: { temp_range: [68, 78], score_bonus: 30 },      // Peak 70-74°F, SINGLE spawn
            post_spawn: { temp_range: [78, 88], score_bonus: 15 },
            fall: { temp_range: [58, 75], score_bonus: 18 }
        },
        preferences: {
            shellfish_specialist: true,    // Crushes snails/mussels
            single_spawn: true,            // ONE spawn per year (vs bluegill's multiple)
            spawns_after_bluegill: 14,     // 2-3 weeks AFTER bluegill
            deeper_nester: true,           // 3-8 ft vs bluegill's 1-4 ft
            prefers_clear_water: true,
            less_moon_sensitive: true,
            stronger_fighter: true,
            grows_larger: true,            // 2-3 lbs common
            bottom_feeder: true,
            depth_by_season: {
                spring: [4, 10],
                summer: [12, 25],          // Deeper than bluegill
                fall: [8, 15],
                winter: [20, 35]
            }
        }
    },
    
    green_sunfish: {
        name: "Green Sunfish",
        scientific: "Lepomis cyanellus",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [35, 48], score_bonus: -8 },   // Very hardy
            cold_water: { temp_range: [48, 58], score_bonus: 10 },
            pre_spawn: { temp_range: [58, 68], score_bonus: 18 },
            spawn: { temp_range: [68, 82], score_bonus: 22 },      // Wide range, multiple spawns
            post_spawn: { temp_range: [82, 90], score_bonus: 15 }, // Most heat-tolerant
            fall: { temp_range: [58, 78], score_bonus: 15 }
        },
        preferences: {
            most_adaptable: true,          // Survives anywhere
            very_aggressive: true,         // Attacks everything
            large_mouth: true,             // Disproportionate mouth
            heat_tolerant: true,           // Handles 90°F+
            poor_water_quality_ok: true,
            shallow_oriented: true,
            overpopulates: true,           // Management concern
            hybridizes_readily: true,
            depth_by_season: {
                spring: [1, 5],
                summer: [2, 8],            // Stays shallow
                fall: [2, 6],
                winter: [8, 15]
            }
        }
    },
    
    warmouth: {
        name: "Warmouth",
        scientific: "Lepomis gulosus",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [38, 50], score_bonus: -10 },
            cold_water: { temp_range: [50, 60], score_bonus: 8 },
            pre_spawn: { temp_range: [60, 68], score_bonus: 20 },
            spawn: { temp_range: [68, 78], score_bonus: 28 },      // Peak 70-75°F
            post_spawn: { temp_range: [78, 88], score_bonus: 15 },
            fall: { temp_range: [60, 78], score_bonus: 18 }
        },
        preferences: {
            bass_like_behavior: true,      // More bass-like than other sunfish
            has_small_teeth: true,         // Unique among sunfish except bass
            prefers_murky_water: true,     // Stained/murky preferred
            heavy_cover: true,             // Thick vegetation
            piscivorous: true,             // Eats small fish
            aggressive_strikes: true,
            low_light_active: true,
            stained_water_bonus: 15,
            murky_water_ok: true,
            depth_by_season: {
                spring: [2, 6],
                summer: [4, 12],
                fall: [3, 10],
                winter: [8, 20]
            }
        }
    },
    
    longear: {
        name: "Longear Sunfish",
        scientific: "Lepomis megalotis",
        family: "Sunfish (Lepomis)",
        phases: {
            inactive: { temp_range: [35, 48], score_bonus: -12 },
            cold_water: { temp_range: [48, 58], score_bonus: 8 },
            pre_spawn: { temp_range: [58, 65], score_bonus: 20 },
            spawn: { temp_range: [65, 75], score_bonus: 28 },      // Peak 68-72°F
            post_spawn: { temp_range: [75, 85], score_bonus: 15 },
            fall: { temp_range: [58, 75], score_bonus: 18 }
        },
        preferences: {
            stream_specialist: true,        // Prefers flowing water
            current_preferred: true,
            most_colorful: true,            // Breeding males spectacular
            gravel_spawner: true,
            clear_water_required: true,
            small_size: true,               // 4-7" average
            active_feeder: true,
            hybridizes: true,
            depth_by_season: {
                spring: [1, 4],             // Shallow in streams
                summer: [2, 8],
                fall: [2, 6],
                winter: [4, 12]
            }
        }
    },
    
    rock_bass: {
        name: "Rock Bass",
        scientific: "Ambloplites rupestris",
        family: "Sunfish (Ambloplites)",
        phases: {
            inactive: { temp_range: [32, 42], score_bonus: -15 },
            cold_water: { temp_range: [42, 52], score_bonus: 5 },
            pre_spawn: { temp_range: [52, 60], score_bonus: 20 },
            spawn: { temp_range: [60, 70], score_bonus: 30 },      // Peak 63-67°F
            post_spawn: { temp_range: [70, 82], score_bonus: 15 },
            fall: { temp_range: [55, 72], score_bonus: 20 }
        },
        preferences: {
            rocks_only: true,               // ONLY rocky habitat
            aggressive: true,
            ambush_predator: true,
            large_red_eyes: true,           // Low-light hunting
            current_tolerant: true,
            day_night_active: true,
            crayfish_lover: true,
            strong_fighter: true,
            depth_by_season: {
                spring: [2, 8],
                summer: [6, 15],
                fall: [5, 12],
                winter: [12, 25]
            }
        }
    },
    
    // ==================== BLACK BASS (Micropterus) ====================
    
    bass: {
        name: "Largemouth Bass",
        scientific: "Micropterus salmoides",
        family: "Black Bass (Micropterus)",
        phases: {
            winter: { temp_range: [35, 48], score_bonus: -10 },
            pre_spawn: { temp_range: [48, 58], score_bonus: 20 },
            spawn: { temp_range: [58, 70], score_bonus: 30 },      // Peak 62-68°F
            post_spawn: { temp_range: [70, 75], score_bonus: -5 },
            early_summer: { temp_range: [75, 80], score_bonus: 18 },
            summer: { temp_range: [80, 88], score_bonus: 12 },
            fall: { temp_range: [48, 75], score_bonus: 25 }
        },
        preferences: {
            wind_ideal: [5, 15],
            loves_light_rain: true,
            overcast_bonus: 8,
            stained_water_bonus: 15,
            moon_sensitive: true,
            vegetation_oriented: true,
            ambush_predator: true,
            pressure_very_sensitive: true,
            depth_by_season: {
                spring: [2, 10],
                summer: [8, 25],
                fall: [5, 15],
                winter: [15, 35]
            }
        }
    },
    
    smallmouth: {
        name: "Smallmouth Bass",
        scientific: "Micropterus dolomieu",
        family: "Black Bass (Micropterus)",
        phases: {
            inactive: { temp_range: [35, 45], score_bonus: -12 },
            cold_water: { temp_range: [45, 52], score_bonus: 5 },
            pre_spawn: { temp_range: [52, 60], score_bonus: 22 },
            spawn: { temp_range: [60, 68], score_bonus: 32 },      // Peak 62-65°F (COOLER!)
            post_spawn: { temp_range: [68, 72], score_bonus: 10 },
            summer: { temp_range: [72, 80], score_bonus: 20 },     // Prefers cooler
            fall: { temp_range: [55, 70], score_bonus: 28 }        // Heavy feeding
        },
        preferences: {
            rocks_required: true,           // Rocky habitat only
            clear_water_required: true,     // Must have clear water
            current_lover: true,            // Thrives in current
            cooler_water: true,             // 65-75°F optimal (cooler than largemouth)
            crayfish_primary: true,
            acrobatic_fighter: true,        // Jumps
            strongest_fighter: true,        // Pound-for-pound
            spawns_earlier: true,           // 5-10 days before largemouth
            guards_longer: true,            // 3-4 weeks
            moon_sensitive: false,          // Less than largemouth
            depth_by_season: {
                spring: [5, 15],
                summer: [10, 25],
                fall: [8, 20],
                winter: [20, 40]
            }
        }
    },
    
    spotted: {
        name: "Spotted Bass (Kentucky Bass)",
        scientific: "Micropterus punctulatus",
        family: "Black Bass (Micropterus)",
        phases: {
            inactive: { temp_range: [38, 48], score_bonus: -10 },
            cold_water: { temp_range: [48, 55], score_bonus: 8 },
            pre_spawn: { temp_range: [55, 62], score_bonus: 20 },
            spawn: { temp_range: [62, 70], score_bonus: 30 },      // Peak 63-68°F (between LM/SM)
            post_spawn: { temp_range: [70, 75], score_bonus: 12 },
            summer: { temp_range: [75, 85], score_bonus: 18 },
            fall: { temp_range: [58, 72], score_bonus: 25 }
        },
        preferences: {
            deep_preference: true,          // Deeper than largemouth
            heavy_schooling: true,          // 40-200 fish schools
            very_aggressive: true,          // Competitive feeders
            current_lover: true,            // Main river channels
            follows_shad: true,             // Follows baitfish
            deep_ledges: true,              // 30-40 ft in summer
            clear_to_stained: true,
            smaller_mouth: true,            // Use smaller baits
            hybridizes: true,               // With LM and SM
            depth_by_season: {
                spring: [5, 15],
                summer: [15, 40],           // DEEP
                fall: [10, 25],
                winter: [25, 50]
            }
        }
    },
    
    // ==================== CRAPPIE (Pomoxis) ====================
    
    white_crappie: {
        name: "White Crappie",
        scientific: "Pomoxis annularis",
        family: "Crappie (Pomoxis)",
        phases: {
            inactive: { temp_range: [35, 45], score_bonus: -8 },
            cold_water: { temp_range: [45, 52], score_bonus: 10 },
            pre_spawn: { temp_range: [52, 58], score_bonus: 22 },
            spawn: { temp_range: [58, 68], score_bonus: 35 },      // Peak 60-65°F
            post_spawn: { temp_range: [68, 75], score_bonus: 15 },
            summer: { temp_range: [75, 85], score_bonus: 18 },
            fall: { temp_range: [55, 70], score_bonus: 25 }
        },
        preferences: {
            tolerates_murky: true,          // KEY: Unlike black crappie
            slight_current_ok: true,        // Rivers
            brush_oriented: true,           // Brush piles, timber
            suspended: true,                // Midwater column
            tight_schools: true,            // 50-200 fish
            more_aggressive: true,          // Than black crappie
            vertical_bars: true,            // 5-9 vertical bars (ID)
            spawns_earlier: true,           // 5-7 days before black
            day_active: true,
            less_moon_sensitive: true,
            depth_by_season: {
                spring: [2, 8],
                summer: [10, 20],           // Suspended
                fall: [8, 15],
                winter: [15, 25]
            }
        }
    },
    
    black_crappie: {
        name: "Black Crappie",
        scientific: "Pomoxis nigromaculatus",
        family: "Crappie (Pomoxis)",
        phases: {
            inactive: { temp_range: [32, 45], score_bonus: -10 },
            cold_water: { temp_range: [45, 50], score_bonus: 8 },
            pre_spawn: { temp_range: [50, 55], score_bonus: 20 },
            spawn: { temp_range: [55, 65], score_bonus: 38 },      // Peak 58-62°F (COOLER!)
            post_spawn: { temp_range: [65, 72], score_bonus: 15 },
            summer: { temp_range: [72, 85], score_bonus: 20 },
            fall: { temp_range: [55, 70], score_bonus: 28 }
        },
        preferences: {
            loves_overcast: true,
            loves_calm: true,
            pressure_sensitive: 40,
            clear_water_required: true,     // KEY: Unlike white crappie
            weed_oriented: true,            // Vegetation (unlike white)
            deeper_than_white: true,
            firm_bottom_required: true,
            looser_schools: true,           // Than white crappie
            larger_average: true,           // 1.5-3 lbs
            night_active: true,             // Unlike white
            very_moon_sensitive: true,      // MORE than white
            irregular_spots: true,          // Random spots (ID)
            spawns_later: true,             // 5-7 days after white
            depth_by_season: {
                spring: [3, 10],
                summer: [12, 25],           // Deeper than white
                fall: [8, 15],
                winter: [20, 30]
            }
        }
    }
};

// Helper function to get all species by family
export function getSpeciesByFamily() {
    return {
        lepomis: ['bluegill', 'coppernose', 'redear', 'green_sunfish', 'warmouth', 'longear'],
        bass: ['bass', 'smallmouth', 'spotted'],
        crappie: ['white_crappie', 'black_crappie'],
        other_sunfish: ['rock_bass']
    };
}

// Helper function to get species common names
export function getSpeciesNames() {
    const names = {};
    for (const [key, data] of Object.entries(SPECIES_DATA)) {
        names[key] = data.name;
    }
    return names;
}

// Get spawning order by temperature
export function getSpawningOrder() {
    return [
        { species: 'black_crappie', temp: 58, range: '55-65°F' },
        { species: 'smallmouth', temp: 62, range: '60-68°F' },
        { species: 'white_crappie', temp: 62, range: '58-68°F' },
        { species: 'rock_bass', temp: 65, range: '60-70°F' },
        { species: 'spotted', temp: 65, range: '62-70°F' },
        { species: 'bass', temp: 65, range: '58-70°F' },
        { species: 'longear', temp: 70, range: '65-75°F' },
        { species: 'redear', temp: 72, range: '68-78°F' },
        { species: 'bluegill', temp: 72, range: '67-80°F' },
        { species: 'coppernose', temp: 71, range: '67-80°F (5-7 days earlier)' },
        { species: 'warmouth', temp: 72, range: '68-78°F' },
        { species: 'green_sunfish', temp: 75, range: '68-82°F' }
    ];
}
