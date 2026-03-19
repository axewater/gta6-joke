# Changelog

## [0.10.0] - 2026-03-20

### Added
- NPC sphere heads with hair, sphere eyes, and proper facial features matching player quality
- NPC cylinder limbs with joint pivots and extruded trapezoid torsos
- NPC arm counter-swing animation while walking (regular NPCs, gang, police)
- NPC shadow casting enabled on all character meshes
- Multi-blob tree canopies (3-5 overlapping spheres) replacing single-sphere blobs
- Random branches sticking out of tree trunks for visual variety
- Doors on all buildings with 3 random styles: dark rectangle, framed with awning, glass entrance
- Exterior elevator shafts on ~28% of downtown skyscrapers with animated elevator cars
- Building ground landscaping: concrete pads, planter boxes with bushes, benches, lamp posts, trash cans
- NPC hair color variety (6 hair colors: black, dark brown, sandy, blonde, auburn)
- Player smoking elbow bend animation for realistic cigarette-to-mouth motion
- Hair color palette constant (NPC_HAIR_COLORS)

### Changed
- Window texture scale doubled for more realistic window sizing
- Player pants color from dark navy (0x1a1a66) to medium blue jeans (0x3355aa)
- Player neck cylinder extended to bridge torso-to-head gap
- Gang NPC guns now attached to right hand (animate with arm swing)
- Police officer guns now attached to right hand
- Gang NPC bandana position adjusted for sphere heads
- Park trees upgraded with multi-blob canopies and branches (palm + deciduous)

## [0.9.0] - 2026-03-19

### Added
- District-aware procedural ground texture with per-district color palettes and noise detail
- Grass tufts system with chunked InstancedMesh and distance culling
- Rocks, pebbles, and flower clusters in residential and park districts
- Sidewalk weeds along road edges
- Industrial ground detail with dirt patches, gravel, and oil stain decals
- Garden beds with flowers in residential blocks

### Changed
- Ground material now uses canvas-generated texture instead of flat color

## [0.8.0] - 2026-03-19

### Added
- Mobile touch controls with virtual joystick (nipplejs) and on-screen buttons for shoot, jump, enter vehicle, and buy
- Mobile detection and automatic touch UI activation
- Enhanced player animations: sprint lean, body bob, torso turn lean, arm spread while running
- Idle animation system with breathing and subtle weight-shift
- Idle exhaust smoke particles for stationary vehicles
- Extruded body profiles for cars (sedan silhouette replaces box geometry)
- Player character head with detailed hair, eyes, and facial features
- Distinct player model with unique shirt/pants colors and body group hierarchy

### Changed
- Vehicle body geometry now uses ExtrudeGeometry side-silhouette profiles for more realistic shapes
- AI systems run every frame on mobile (instead of every 2 frames) to reduce stutter
- Renderer adjustments for mobile performance
- Day/night cycle and HUD refinements
- Improved constants and state management

### Fixed
- Various rendering and state consistency fixes across city environment, object pool, and day/night systems

## [0.7.0] - 2026-03-19

### Added
- Performance systems: spatial grid, object pooling, and geometry merging

## [0.6.0] - 2026-03-19

### Changed
- Scale characters smaller and vehicles larger with updated collision bounds

## [0.5.0] - 2026-03-19

### Changed
- Refactor city into modular files and update core systems

## [0.4.0] - 2026-03-19

### Added
- Gang zones, restaurants, vehicle physics, and NPC improvements

## [0.3.0] - 2026-03-19

### Added
- Helicopter, tanks, traffic lights, mountains, and wanted system overhaul

## [0.2.0] - 2026-03-19

### Added
- Weather system, day/night cycle, enhanced city, vehicle damage, NPC ragdoll, and gameplay improvements

## [0.1.0] - 2026-03-19

### Added
- Initial GTA6 joke game with Three.js
