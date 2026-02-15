// Complete Sunfish Family (Centrarchidae) and related freshwater sportfish
// Biology-first phase windows and feeding-opportunity scoring.

export const SPECIES_DATA = {
  // ==================== TRUE SUNFISH (Lepomis) ====================

  bluegill: {
    name: 'Bluegill',
    scientific: 'Lepomis macrochirus',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [32, 45], score_bonus: -15 },
      dormant: { temp_range: [45, 55], score_bonus: 5 },
      pre_spawn: { temp_range: [55, 67], score_bonus: 30 },
      spawn: { temp_range: [67, 80], score_bonus: 18 },
      post_spawn: { temp_range: [80, 88], score_bonus: 22 },
      fall: { temp_range: [55, 75], score_bonus: 24 }
    },
    preferences: {
      spawn_needs_sun: true,
      loves_calm: true,
      structure_oriented: true,
      moon_sensitive: true,
      lunar_bonus_cap: 10,
      insect_hatch_bonus: 15,
      schooling: true,
      depth_by_season: {
        spring: [2, 6],
        summer: [10, 20],
        fall: [5, 12],
        winter: [15, 30]
      }
    }
  },

  coppernose: {
    name: 'Coppernose Bluegill',
    scientific: 'Lepomis macrochirus (coppernose strain)',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [32, 45], score_bonus: -15 },
      dormant: { temp_range: [45, 55], score_bonus: 6 },
      pre_spawn: { temp_range: [56, 67], score_bonus: 31 },
      spawn: { temp_range: [67, 80], score_bonus: 19 },
      post_spawn: { temp_range: [80, 88], score_bonus: 23 },
      fall: { temp_range: [55, 75], score_bonus: 25 }
    },
    preferences: {
      spawn_needs_sun: true,
      loves_calm: true,
      structure_oriented: true,
      moon_sensitive: true,
      lunar_bonus_cap: 10,
      faster_growth: true,
      more_aggressive: true,
      early_spawner: false,
      overlaps_bluegill_spawn_window: true,
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
    name: 'Redear Sunfish (Shellcracker)',
    scientific: 'Lepomis microlophus',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [35, 48], score_bonus: -10 },
      dormant: { temp_range: [48, 58], score_bonus: 8 },
      pre_spawn: { temp_range: [58, 66], score_bonus: 29 },
      spawn: { temp_range: [66, 76], score_bonus: 17 },
      post_spawn: { temp_range: [76, 88], score_bonus: 21 },
      fall: { temp_range: [58, 75], score_bonus: 23 }
    },
    preferences: {
      shellfish_specialist: true,
      single_spawn: true,
      spawns_after_bluegill: null,
      overlapping_spawn_window: true,
      deeper_nester: true,
      prefers_clear_water: true,
      less_moon_sensitive: true,
      lunar_bonus_cap: 6,
      stronger_fighter: true,
      grows_larger: true,
      bottom_feeder: true,
      depth_by_season: {
        spring: [4, 10],
        summer: [12, 25],
        fall: [8, 15],
        winter: [20, 35]
      }
    }
  },

  green_sunfish: {
    name: 'Green Sunfish',
    scientific: 'Lepomis cyanellus',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [35, 48], score_bonus: -8 },
      dormant: { temp_range: [48, 58], score_bonus: 10 },
      pre_spawn: { temp_range: [58, 68], score_bonus: 27 },
      spawn: { temp_range: [68, 82], score_bonus: 18 },
      post_spawn: { temp_range: [82, 90], score_bonus: 20 },
      fall: { temp_range: [58, 78], score_bonus: 22 }
    },
    preferences: {
      most_adaptable: true,
      very_aggressive: true,
      large_mouth: true,
      heat_tolerant: true,
      poor_water_quality_ok: true,
      shallow_oriented: true,
      overpopulates: true,
      hybridizes_readily: true,
      depth_by_season: {
        spring: [1, 5],
        summer: [2, 8],
        fall: [2, 6],
        winter: [8, 15]
      }
    }
  },

  warmouth: {
    name: 'Warmouth',
    scientific: 'Lepomis gulosus',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [38, 50], score_bonus: -10 },
      dormant: { temp_range: [50, 60], score_bonus: 8 },
      pre_spawn: { temp_range: [60, 68], score_bonus: 28 },
      spawn: { temp_range: [68, 78], score_bonus: 18 },
      post_spawn: { temp_range: [78, 88], score_bonus: 21 },
      fall: { temp_range: [60, 78], score_bonus: 23 }
    },
    preferences: {
      bass_like_behavior: true,
      has_small_teeth: true,
      prefers_murky_water: true,
      heavy_cover: true,
      piscivorous: true,
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
    name: 'Longear Sunfish',
    scientific: 'Lepomis megalotis',
    family: 'Sunfish (Lepomis)',
    phases: {
      inactive: { temp_range: [35, 48], score_bonus: -12 },
      dormant: { temp_range: [48, 58], score_bonus: 8 },
      pre_spawn: { temp_range: [58, 65], score_bonus: 27 },
      spawn: { temp_range: [65, 75], score_bonus: 17 },
      post_spawn: { temp_range: [75, 85], score_bonus: 20 },
      fall: { temp_range: [58, 75], score_bonus: 23 }
    },
    preferences: {
      stream_specialist: true,
      current_preferred: true,
      most_colorful: true,
      gravel_spawner: true,
      clear_water_required: true,
      small_size: true,
      active_feeder: true,
      hybridizes: true,
      depth_by_season: {
        spring: [1, 4],
        summer: [2, 8],
        fall: [2, 6],
        winter: [4, 12]
      }
    }
  },

  rock_bass: {
    name: 'Rock Bass',
    scientific: 'Ambloplites rupestris',
    family: 'Sunfish (Ambloplites)',
    phases: {
      inactive: { temp_range: [32, 42], score_bonus: -15 },
      dormant: { temp_range: [42, 52], score_bonus: 5 },
      pre_spawn: { temp_range: [52, 60], score_bonus: 28 },
      spawn: { temp_range: [60, 70], score_bonus: 18 },
      post_spawn: { temp_range: [70, 82], score_bonus: 21 },
      fall: { temp_range: [55, 72], score_bonus: 24 }
    },
    preferences: {
      rocks_only: true,
      aggressive: true,
      ambush_predator: true,
      large_red_eyes: true,
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
    name: 'Largemouth Bass',
    scientific: 'Micropterus salmoides',
    family: 'Black Bass (Micropterus)',
    phases: {
      winter: { temp_range: [35, 48], score_bonus: -10 },
      pre_spawn: { temp_range: [48, 58], score_bonus: 30 },
      spawn: { temp_range: [58, 70], score_bonus: 16 },
      post_spawn: { temp_range: [70, 75], score_bonus: 18 },
      early_summer: { temp_range: [75, 80], score_bonus: 20 },
      summer: { temp_range: [80, 88], score_bonus: 12 },
      fall: { temp_range: [48, 75], score_bonus: 26 }
    },
    preferences: {
      wind_ideal: [5, 15],
      loves_light_rain: true,
      overcast_bonus: 8,
      stained_water_bonus: 15,
      moon_sensitive: true,
      lunar_bonus_cap: 12,
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
    name: 'Smallmouth Bass',
    scientific: 'Micropterus dolomieu',
    family: 'Black Bass (Micropterus)',
    phases: {
      inactive: { temp_range: [35, 45], score_bonus: -12 },
      dormant: { temp_range: [45, 52], score_bonus: 5 },
      pre_spawn: { temp_range: [52, 60], score_bonus: 31 },
      spawn: { temp_range: [60, 68], score_bonus: 17 },
      post_spawn: { temp_range: [68, 72], score_bonus: 20 },
      summer: { temp_range: [72, 80], score_bonus: 21 },
      fall: { temp_range: [55, 70], score_bonus: 27 }
    },
    preferences: {
      rocks_required: true,
      clear_water_required: true,
      current_lover: true,
      cooler_water: true,
      crayfish_primary: true,
      acrobatic_fighter: true,
      strongest_fighter: true,
      spawns_earlier: true,
      guards_longer: true,
      moon_sensitive: false,
      depth_by_season: {
        spring: [5, 15],
        summer: [10, 25],
        fall: [8, 20],
        winter: [20, 40]
      }
    }
  },

  spotted: {
    name: 'Spotted Bass (Kentucky Bass)',
    scientific: 'Micropterus punctulatus',
    family: 'Black Bass (Micropterus)',
    phases: {
      inactive: { temp_range: [38, 48], score_bonus: -10 },
      dormant: { temp_range: [48, 55], score_bonus: 8 },
      pre_spawn: { temp_range: [55, 62], score_bonus: 29 },
      spawn: { temp_range: [62, 70], score_bonus: 17 },
      post_spawn: { temp_range: [70, 75], score_bonus: 19 },
      summer: { temp_range: [75, 85], score_bonus: 20 },
      fall: { temp_range: [58, 72], score_bonus: 25 }
    },
    preferences: {
      deep_preference: true,
      heavy_schooling: true,
      very_aggressive: true,
      current_lover: true,
      follows_shad: true,
      deep_ledges: true,
      clear_to_stained: true,
      smaller_mouth: true,
      hybridizes: true,
      depth_by_season: {
        spring: [5, 15],
        summer: [15, 40],
        fall: [10, 25],
        winter: [25, 50]
      }
    }
  },

  // ==================== CRAPPIE (Pomoxis) ====================

  // Generic crappie (defaults to white crappie for backwards compatibility)
  crappie: {
    name: 'Crappie (White)',
    scientific: 'Pomoxis annularis',
    family: 'Crappie (Pomoxis)',
    phases: {
      inactive: { temp_range: [35, 45], score_bonus: -8 },
      dormant: { temp_range: [45, 52], score_bonus: 10 },
      pre_spawn: { temp_range: [52, 60], score_bonus: 32 },
      spawn: { temp_range: [58, 68], score_bonus: 19 },
      post_spawn: { temp_range: [68, 75], score_bonus: 22 },
      summer: { temp_range: [75, 85], score_bonus: 18 },
      fall: { temp_range: [55, 70], score_bonus: 24 }
    },
    preferences: {
      tolerates_murky: true,
      slight_current_ok: true,
      brush_oriented: true,
      suspended: true,
      tight_schools: true,
      more_aggressive: true,
      vertical_bars: true,
      spawns_earlier: false,
      day_active: true,
      less_moon_sensitive: true,
      lunar_bonus_cap: 6,
      depth_by_season: {
        spring: [2, 8],
        summer: [10, 20],
        fall: [8, 15],
        winter: [15, 25]
      }
    }
  },

  white_crappie: {
    name: 'White Crappie',
    scientific: 'Pomoxis annularis',
    family: 'Crappie (Pomoxis)',
    phases: {
      inactive: { temp_range: [35, 45], score_bonus: -8 },
      dormant: { temp_range: [45, 52], score_bonus: 10 },
      pre_spawn: { temp_range: [52, 60], score_bonus: 32 },
      spawn: { temp_range: [58, 68], score_bonus: 19 },
      post_spawn: { temp_range: [68, 75], score_bonus: 22 },
      summer: { temp_range: [75, 85], score_bonus: 18 },
      fall: { temp_range: [55, 70], score_bonus: 24 }
    },
    preferences: {
      tolerates_murky: true,
      slight_current_ok: true,
      brush_oriented: true,
      suspended: true,
      tight_schools: true,
      more_aggressive: true,
      vertical_bars: true,
      spawns_earlier: false,
      overlapping_spawn_window: true,
      day_active: true,
      less_moon_sensitive: true,
      lunar_bonus_cap: 6,
      depth_by_season: {
        spring: [2, 8],
        summer: [10, 20],
        fall: [8, 15],
        winter: [15, 25]
      }
    }
  },

  black_crappie: {
    name: 'Black Crappie',
    scientific: 'Pomoxis nigromaculatus',
    family: 'Crappie (Pomoxis)',
    phases: {
      inactive: { temp_range: [32, 45], score_bonus: -10 },
      dormant: { temp_range: [45, 50], score_bonus: 8 },
      pre_spawn: { temp_range: [50, 60], score_bonus: 31 },
      spawn: { temp_range: [56, 66], score_bonus: 18 },
      post_spawn: { temp_range: [66, 72], score_bonus: 22 },
      summer: { temp_range: [72, 85], score_bonus: 20 },
      fall: { temp_range: [55, 70], score_bonus: 25 }
    },
    preferences: {
      loves_overcast: true,
      loves_calm: true,
      pressure_sensitive: 40,
      clear_water_required: true,
      weed_oriented: true,
      deeper_than_white: true,
      firm_bottom_required: true,
      looser_schools: true,
      larger_average: true,
      night_active: true,
      very_moon_sensitive: true,
      lunar_bonus_cap: 8,
      irregular_spots: true,
      spawns_later: false,
      overlapping_spawn_window: true,
      depth_by_season: {
        spring: [3, 10],
        summer: [12, 25],
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
    { species: 'black_crappie', temp: 61, range: '56-66°F' },
    { species: 'smallmouth', temp: 64, range: '60-68°F' },
    { species: 'white_crappie', temp: 63, range: '58-68°F' },
    { species: 'rock_bass', temp: 65, range: '60-70°F' },
    { species: 'spotted', temp: 66, range: '62-70°F' },
    { species: 'bass', temp: 64, range: '58-70°F' },
    { species: 'longear', temp: 69, range: '65-75°F' },
    { species: 'redear', temp: 70, range: '66-76°F' },
    { species: 'bluegill', temp: 72, range: '67-80°F' },
    { species: 'coppernose', temp: 71, range: '67-80°F' },
    { species: 'warmouth', temp: 72, range: '68-78°F' },
    { species: 'green_sunfish', temp: 75, range: '68-82°F' }
  ];
}
