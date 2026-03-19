// ── Game Constants ──────────────────────────────────────────────────────
export const WORLD_SCALE = 2;       // scales city geometry vs. player/car size
export const GRID = 10;
export const BLOCK = 70 * WORLD_SCALE;
export const ROAD = 16 * WORLD_SCALE;
export const CELL = BLOCK + ROAD;
export const CITY_SIZE = GRID * CELL;
export const HALF_CITY = CITY_SIZE / 2;

export const GRAVITY = -30;
export const PLAYER_SPEED = 8;
export const SPRINT_MULT = 1.8;
export const JUMP_FORCE = 12;
export const CAR_MAX_SPEED = 30;
export const CAR_ACCEL = 15;
export const CAR_BRAKE = 20;
export const CAR_FRICTION = 5;
export const CAR_TURN = 2.5;
export const RAGDOLL_KILL_SPEED = 15;

export const BLOOM_STRENGTH_DAY = 0.35;
export const BLOOM_STRENGTH_NIGHT = 1.2;

export const BUILDING_COLORS = [
  0xFFB6C1, 0x40E0D0, 0xFFFDD0, 0xFF7F50, 0x98FF98,
  0xFFDAB9, 0x7FFFD4, 0xDDA0DD, 0xE0FFFF, 0xFFC0CB,
  0xAFEEEE, 0xFFE4B5, 0xF0E68C, 0xB0E0E6, 0xFADADD,
];

export const NEON_COLORS = [0xFF1493, 0x00FFFF, 0xFF4500, 0x9400D3, 0x39FF14];

export const RADIO_STATIONS = [
  'VICE CITY FM', 'FLASH FM', 'EMOTION 98.3',
  'WAVE 103', 'V-ROCK', 'RADIO ESPANTOSO', 'FEVER 105'
];

// District color palettes
export const DOWNTOWN_COLORS = [0x88AACC, 0xAABBCC, 0xCCCCDD, 0xBBCCDD, 0x99AABB];
export const RESIDENTIAL_COLORS = [0xDEB887, 0xFFF8DC, 0xFAEBD7, 0xF5DEB3, 0xE8D8C8];
export const INDUSTRIAL_COLORS = [0x666655, 0x8B7355, 0x556655, 0x777766, 0x887766];
export const SHOP_SIGN_COLORS = [0xFF1493, 0x00FFFF, 0xFF4500, 0x39FF14, 0xFFD700];

// Ramp constants
export const RAMP_WIDTH = 6 * WORLD_SCALE;
export const RAMP_LENGTH = 12 * WORLD_SCALE;
export const RAMP_HEIGHT = 4.5 * WORLD_SCALE;

export const TROPICAL_OUTFIT_COLORS = [
  0xFF6B6B, 0x4ECDC4, 0xFFE66D, 0xFF8C42, 0x95E1D3,
  0xF38181, 0xAA96DA, 0xFCBFB7, 0x45B7D1, 0xDFE6E9
];

export const SKIN_TONES = [0xDEB887, 0xC68642, 0x8D5524, 0xFFDBB4, 0xF1C27D];

// Vehicle collision constants
export const VEH_MAX_HEALTH = 100;
export const CAR_NPC_KILL_SPEED = 2;
export const CAR_CAR_MIN_DAMAGE = 5;
export const CAR_CAR_DAMAGE_MULT = 0.8;
export const CAR_BUILDING_DAMAGE_MULT = 0.5;
export const CAR_BUILDING_DAMAGE_MIN_SPEED = 5;
export const CAR_BOUNCE_RESTITUTION = 0.4;
export const NPC_RAGDOLL_LAUNCH_MULT = 1.5;
export const NPC_RAGDOLL_DURATION = 3.0;
export const EXPLOSION_DURATION = 4.0;

// Traffic
export const TRAFFIC_CAR_COUNT = 25;
export const TRAFFIC_GREEN_TIME = 12;
export const TRAFFIC_YELLOW_TIME = 2;

// NPC count
export const NPC_COUNT = 80;

// Gang zones
export const GANG_ZONES = [
  { name: 'Los Diablos', color: 0xFF2222, shirtColor: 0xCC0000,
    cells: [[0,0],[0,1],[1,0],[1,1]], shootRange: 30, aggroRange: 40 },
  { name: 'Grove Street', color: 0x22FF22, shirtColor: 0x006600,
    cells: [[9,0],[9,1],[8,0],[8,1]], shootRange: 25, aggroRange: 35 },
];
export const GANG_NPC_PER_ZONE = 8;
export const GANG_SHOOT_COOLDOWN = 1.5;
