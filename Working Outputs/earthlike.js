/* 
  EarthLike.js
  ------------
  This Civ7 map–generator script implements an “Earth‐like” map. I interpret Earth–like as follows:
    • The map is dominated by two major, irregularly–shaped continents—a West and an East continent—to mimic Earth’s large landmasses.
    • Their coastlines are naturally curved and jagged, with internally indented bays, peninsulas and even some internal seas.
    • Overall, the map provides plenty of land, and this version has been tweaked to yield slightly more land overall by lowering the fractal water threshold.
    • An 8–tile–wide band of ocean—the separation gap—is maintained between the two continents so that a player must cross at least eight water/coast tiles to journey between them.
    • Multiple fractal passes help create organic coastlines that are far from square, reflecting Earth–style geography.
  
  The script follows the same API rules as the other map types; it initializes the map, carves out landmasses with fractal noise,
  and then adds mountains, hills, rivers, biomes, resources, etc., before finally assigning starting positions.
  
  In this version, to provide slightly more land overall, the primary fractal pass uses a lower water threshold (set to 20% instead of 30%),
  meaning more plots meet the condition to become land.
*/

/* Import necessary modules from the Civ7 mapping framework */
console.log("Generating using script EarthLike.js");

import * as utilities from '/base-standard/maps/map-utilities.js';
import * as globals from '/base-standard/maps/map-globals.js';
import { assignStartPositions, chooseStartSectors } from '/base-standard/maps/assign-starting-plots.js';
import { addMountains, addHills, expandCoasts, buildRainfallMap, generateLakes } from '/base-standard/maps/elevation-terrain-generator.js';
import { addFeatures, designateBiomes } from '/base-standard/maps/feature-biome-generator.js';
import { addNaturalWonders } from '/base-standard/maps/natural-wonder-generator.js';
import { generateResources } from '/base-standard/maps/resource-generator.js';
import { addVolcanoes } from '/base-standard/maps/volcano-generator.js';
import { assignAdvancedStartRegions } from '/base-standard/maps/assign-advanced-start-region.js';
import { generateDiscoveries } from '/base-standard/maps/discovery-generator.js';
import { generateSnow, dumpPermanentSnow } from '/base-standard/maps/snow-generator.js';
import { dumpStartSectors, dumpContinents, dumpTerrain, dumpElevation, dumpRainfall, dumpBiomes, dumpFeatures, dumpResources, dumpNoisePredicate } from '/base-standard/maps/map-debug-helpers.js';


/* 
  Function: requestMapData
  --------------------------
  Logs the received map initialization parameters and passes them to the engine.
*/
function requestMapData(initParams) {
    console.log("Map Width:", initParams.width);
    console.log("Map Height:", initParams.height);
    console.log("Top Latitude:", initParams.topLatitude);
    console.log("Bottom Latitude:", initParams.bottomLatitude);
    console.log("WrapX:", initParams.wrapX);
    console.log("WrapY:", initParams.wrapY);
    console.log("Map Size:", initParams.mapSize);
    engine.call("SetMapInitData", initParams);
}


/* 
  Function: generateMap
  -----------------------
  This is the primary entry–point to generate our Earth–like map.
  
  Key steps in this function:
    1. Retrieve map dimensions and map–size key from GameInfo.Maps.
    2. Define continent boundaries so that two large, irregular landmasses are created:
         - West continent: from the left margin to just before a central 8–tile–wide ocean gap.
         - East continent: from just after that gap to the right margin.
    3. Initialize the map entirely with ocean and clear any plot tags.
    4. For each continent region, use two fractal passes:
         • The primary pass “paints” broad land regions by using a lowered water threshold. (Note: To yield more land overall,
           the threshold is set to 20% water rather than 30%.)
         • The secondary pass refines the coastline by converting some of the land back to water, producing natural bays and inlets.
    5. Then, standard engine calls are made:
         • Expand the coasts and set proper plot tags.
         • Recalculate areas and stamp continents.
         • Add mountains, hills, volcanoes, build elevation and rainfall maps and model rivers.
         • Designate biomes, add natural wonders, floodplains, features, and resources.
         • Finally, assign starting positions and reveal discoveries.
  
  This process adheres to the required ground–rules while ensuring that our continents remain distinctly separated 
  by an 8–tile–wide barrier of ocean.
*/
function generateMap() {
    console.log("Generating Earth–like map...");

    // Retrieve primary map dimensions and map–size info.
    let iWidth   = GameplayMap.getGridWidth();
    let iHeight  = GameplayMap.getGridHeight();
    let uiMapSize = GameplayMap.getMapSize();
    let startPositions = [];
    let mapInfo  = GameInfo.Maps.lookup(uiMapSize);
    if (mapInfo == null)
        return;

    /* 
      Define the separation gap: Enforce an 8–tile–wide band of ocean (oceanBuffer) in the center of the map.
      This guarantees that the two continents (West and East) are distinctly separated.
    */
    let oceanBuffer = 8;
    let gapStart = Math.floor(iWidth / 2) - Math.floor(oceanBuffer / 2);
    let gapEnd   = gapStart + oceanBuffer - 1;
    
    /*
      Define continent boundaries using global parameters for polar water rows and side ocean columns.
      WestContinent extends from the left margin (globals.g_OceanWaterColumns) to just before the gap.
      EastContinent extends from just after the gap to the right margin.
    */
    let westContinent = {
        west:  globals.g_OceanWaterColumns,
        east:  gapStart - 1,
        south: globals.g_PolarWaterRows,
        north: iHeight - globals.g_PolarWaterRows,
        continent: 0
    };
    let eastContinent = {
        west: gapEnd + 1,
        east: iWidth - globals.g_OceanWaterColumns,
        south: globals.g_PolarWaterRows,
        north: iHeight - globals.g_PolarWaterRows,
        continent: 1
    };

    /* 
      Initialize the entire map as ocean and clear all plot tags.
      This guarantees we start from a “water–world” before carving the land.
    */
    for (let y = 0; y < iHeight; y++) {
        for (let x = 0; x < iWidth; x++) {
            TerrainBuilder.setTerrainType(x, y, globals.g_OceanTerrain);
            TerrainBuilder.setPlotTag(x, y, PlotTags.PLOT_TAG_NONE);
        }
    }

    /* 
      Helper Function: createContinent
      ---------------------------------
      This function “carves” out an Earth–like continent in the specified region 
      (defined by its west, east, south, and north boundaries) using two fractal passes:
         1. The primary pass uses a lower water percentage (set to 20% water to yield more land overall)
            so that more plots become land.
         2. The secondary pass uses a slightly higher water threshold to refine the coastline, creating bays, peninsulas and internal seas.
    */
    function createContinent(continent) {
        // Primary fractal pass for broad land formation.
        let fractalSizePrimary = 3;  // Moderate fractal size for sweeping landmass formation.
        FractalBuilder.create(globals.g_LandmassFractal, iWidth, iHeight, fractalSizePrimary, 0);
        let landWaterPercent = 20;   // Lower water percentage (20%) to provide a boost to land availability.
        let waterThresholdPrimary = FractalBuilder.getHeightFromPercent(globals.g_LandmassFractal, landWaterPercent);

        for (let y = continent.south; y <= continent.north; y++) {
            for (let x = continent.west; x <= continent.east; x++) {
                // Only modify plots that are still ocean.
                if (GameplayMap.getTerrainType(x, y) === globals.g_OceanTerrain) {
                    let plotHeight = FractalBuilder.getHeight(globals.g_LandmassFractal, x, y);
                    if (plotHeight >= waterThresholdPrimary) {
                        TerrainBuilder.setTerrainType(x, y, globals.g_FlatTerrain);
                        utilities.addLandmassPlotTags(x, y, eastContinent.west);
                    }
                }
            }
        }

        // Secondary fractal pass for coastline refinement.
        let fractalSizeSecondary = 4; // A slightly different size creates additional irregularity.
        FractalBuilder.create(globals.g_LandmassFractal, iWidth, iHeight, fractalSizeSecondary, 0);
        // Use a slightly higher threshold to “carve back” water from overly uniform areas.
        let waterThresholdSecondary = FractalBuilder.getHeightFromPercent(globals.g_LandmassFractal, landWaterPercent + 10);
        for (let y = continent.south; y <= continent.north; y++) {
            for (let x = continent.west; x <= continent.east; x++) {
                if (GameplayMap.getTerrainType(x, y) === globals.g_FlatTerrain) {
                    let plotHeight = FractalBuilder.getHeight(globals.g_LandmassFractal, x, y);
                    // If the plot doesn't meet the refined criteria, revert it back to water 
                    // to simulate bays, inlets, and internal seas.
                    if (plotHeight < waterThresholdSecondary) {
                        TerrainBuilder.setTerrainType(x, y, globals.g_OceanTerrain);
                        utilities.addWaterPlotTags(x, y, eastContinent.west);
                    }
                }
            }
        }
    }

    // Generate both major continents.
    createContinent(westContinent);
    createContinent(eastContinent);

    // Recalculate and fix any terrain inconsistencies.
    TerrainBuilder.validateAndFixTerrain();

    // Expand coasts to smooth boundaries and assign proper coastal tags.
    expandCoasts(iWidth, iHeight);

    // Recalculate areas after our major modifications.
    AreaBuilder.recalculateAreas();

    // Stamp continents if the engine supports additional grouping.
    TerrainBuilder.stampContinents();

    // Add terrain elevation features:
    addMountains(iWidth, iHeight);
    addVolcanoes(iWidth, iHeight);
    AreaBuilder.recalculateAreas();
    TerrainBuilder.buildElevation();
    addHills(iWidth, iHeight);

    // Build rainfall patterns based on elevation and nearby topography.
    buildRainfallMap(iWidth, iHeight);
    // Model realistic rivers using a defined navigable terrain.
    TerrainBuilder.modelRivers(5, 70, globals.g_NavigableRiverTerrain);
    TerrainBuilder.validateAndFixTerrain();
    TerrainBuilder.defineNamedRivers();

    // Assign biomes (plains, deserts, forests, tundra, etc.) based on latitude, elevation, and rainfall.
    designateBiomes(iWidth, iHeight);

    // Add natural wonders to enhance map variety.
    addNaturalWonders(iWidth, iHeight, mapInfo.NumNaturalWonders);

    // Add floodplains to mimic river deltas and coastal spill–over.
    TerrainBuilder.addFloodplains(4, 10);

    // Apply additional decorative features (e.g., forests, marshes, ruins).
    addFeatures(iWidth, iHeight);
    TerrainBuilder.validateAndFixTerrain();
    AreaBuilder.recalculateAreas();

    // Recalculate water connectivity and store water–plot data.
    TerrainBuilder.storeWaterData();

    // Generate snow near the poles.
    generateSnow(iWidth, iHeight);

    // Choose starting sectors based on the number of players designated in the mapInfo.
    let iNumPlayersWest = mapInfo.PlayersLandmass1;
    let iNumPlayersEast = mapInfo.PlayersLandmass2;
    let iStartSectorRows = mapInfo.StartSectorRows;
    let iStartSectorCols = mapInfo.StartSectorCols;
    let bHumanNearEquator = utilities.needHumanNearEquator();
    let startSectors = chooseStartSectors(iNumPlayersWest, iNumPlayersEast, iStartSectorRows, iStartSectorCols, bHumanNearEquator);

    // Debug: Dump ASCII maps of various map layers.
    dumpStartSectors(startSectors);
    dumpContinents(iWidth, iHeight);
    dumpTerrain(iWidth, iHeight);
    dumpElevation(iWidth, iHeight);
    dumpRainfall(iWidth, iHeight);
    dumpBiomes(iWidth, iHeight);
    dumpFeatures(iWidth, iHeight);
    dumpPermanentSnow(iWidth, iHeight);

    // Generate resources over valid land plots.
    generateResources(iWidth, iHeight, westContinent, eastContinent, iNumPlayersWest, iNumPlayersEast);

    // Assign starting positions for players based on the chosen start sectors.
    startPositions = assignStartPositions(iNumPlayersWest, iNumPlayersEast, westContinent, eastContinent, iStartSectorRows, iStartSectorCols, startSectors);

    // Generate discoveries (hidden bonuses) across the map.
    generateDiscoveries(iWidth, iHeight, startPositions);

    // Debug: Dump resource layout.
    dumpResources(iWidth, iHeight);

    // Recalculate fertility for gameplay balance.
    FertilityBuilder.recalculate();

    // Generate and dump a noise map for debugging Poisson-based placement.
    let seed = GameplayMap.getRandomSeed();
    let avgDistanceBetweenPoints = 3;
    let normalizedRangeSmoothing = 2;
    let poisson = TerrainBuilder.generatePoissonMap(seed, avgDistanceBetweenPoints, normalizedRangeSmoothing);
    let poissonPred = (val) => { return val >= 1 ? "*" : " "; };
    dumpNoisePredicate(iWidth, iHeight, poisson, poissonPred);

    // Finalize advanced starting regions.
    assignAdvancedStartRegions();
}


/* 
  Register event listeners:
    - 'RequestMapInitData' provides the initial map setup data.
    - 'GenerateMap' triggers our Earth–like map generation.
*/
engine.on('RequestMapInitData', requestMapData);
engine.on('GenerateMap', generateMap);

console.log("Loaded EarthLike.js");