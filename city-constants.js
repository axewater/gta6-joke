import {
  GRID, BLOCK, ROAD, CELL, CITY_SIZE, HALF_CITY, WORLD_SCALE,
  BUILDING_COLORS, NEON_COLORS,
  DOWNTOWN_COLORS, RESIDENTIAL_COLORS, INDUSTRIAL_COLORS, SHOP_SIGN_COLORS,
  RAMP_WIDTH, RAMP_LENGTH, RAMP_HEIGHT,
  TRAFFIC_GREEN_TIME, TRAFFIC_YELLOW_TIME
} from './constants.js';

export const S = WORLD_SCALE; // shorthand for scaling absolute dimensions

// ── District Map ────────────────────────────────────────────────────────
// row = gi (north→south), col = gj (west→east)
export const DISTRICT_MAP = [
  ['IND','IND','COM','COM','COM','COM','COM','COM','RES','RES'],
  ['IND','COM','COM','DT', 'DT', 'DT', 'DT', 'COM','COM','RES'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','RES'],
  ['COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','PARK'],
  ['COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM','COM'],
  ['RES','COM','COM','COM','COM','COM','COM','COM','COM','RES'],
  ['RES','RES','COM','COM','COM','COM','COM','COM','RES','RES'],
  ['RES','RES','RES','COM','COM','COM','COM','RES','RES','RES'],
  ['RES','RES','RES','RES','COM','COM','RES','RES','RES','RES'],
];

// Some commercial blocks become parking lots (fixed positions)
const PARKING_LOT_CELLS = [[1,2],[6,3],[8,5]];
export function isParkingLot(gi, gj) {
  return PARKING_LOT_CELLS.some(([r,c]) => r === gi && c === gj);
}

export function getDistrict(gi, gj) {
  if (isParkingLot(gi, gj)) return 'LOT';
  return DISTRICT_MAP[gi][gj];
}

// ── Special building placement map ───────────────────────────────────
export const SPECIAL_BUILDINGS = {
  '6,1': 'RESTAURANT',
  '7,4': 'RESTAURANT',
  '4,8': 'DONUT_SHOP',
  '8,3': 'DONUT_SHOP',
};
