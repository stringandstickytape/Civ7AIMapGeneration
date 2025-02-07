// smiley-earth.js
/**
 * Custom map script - Generates two major continents in a smiley face pattern
 * while maintaining Earth-like characteristics and following all engine rules.
 * @packageDocumentation
 */
console.log("Generating using script smiley-earth.ts");

// Import all required modules
import { assignStartPositions, chooseStartSectors } from '/base-standard/maps/assign-starting-plots.js';
import { addMountains, addHills, buildRainfallMap, generateLakes } from '/base-standard/maps/elevation-terrain-generator.js';
import { addFeatures, designateBiomes } from '/base-standard/maps/feature-biome-generator.js';
import * as globals from '/base-standard/maps/map-globals.js';
import * as utilities from '/base-standard/maps/map-utilities.js';
import { addNaturalWonders } from '/base-standard/maps/natural-wonder-generator.js';
import { generateResources } from '/base-standard/maps/resource-generator.js';
import { addVolcanoes } from '/base-standard/maps/volcano-generator.js';
import { assignAdvancedStartRegions } from '/base-standard/maps/assign-advanced-start-region.js';
import { generateDiscoveries } from '/base-standard/maps/discovery-generator.js';
import { generateSnow, dumpPermanentSnow } from '/base-standard/maps/snow-generator.js';
import { dumpStartSectors, dumpContinents, dumpTerrain, dumpElevation, dumpRainfall, dumpBiomes, dumpFeatures, dumpResources, dumpNoisePredicate } from '/base-standard/maps/map-debug-helpers.js';

function requestMapData(initParams) {
    console.log("Initializing Smiley Earth map...");
    engine.call("SetMapInitData", initParams);
}

function generateMap() {
    console.log("Generating a Smiley Earth map!");
    let iWidth = GameplayMap.getGridWidth();
    let iHeight = GameplayMap.getGridHeight();
    let uiMapSize = GameplayMap.getMapSize();
    let startPositions = [];

    // Get map parameters from game info
    let mapInfo = GameInfo.Maps.lookup(uiMapSize);
    if (mapInfo == null) return;

    // Define continent boundaries with extra wide ocean between them
    // We use 12 ocean tiles (above required 8) to ensure proper separation
    let westContinent = {
        west: globals.g_OceanWaterColumns,
        east: (iWidth/2) - 12,
        south: globals.g_PolarWaterRows,
        north: iHeight - globals.g_PolarWaterRows,
        continent: 0
    };

    let eastContinent = {
        west: (iWidth/2) + 12,
        east: iWidth - globals.g_OceanWaterColumns,
        south: globals.g_PolarWaterRows,
        north: iHeight - globals.g_PolarWaterRows,
        continent: 1
    };

    // Setup sector information for start positions
    let iNumPlayers1 = mapInfo.PlayersLandmass1;
    let iNumPlayers2 = mapInfo.PlayersLandmass2;
    let iNumNaturalWonders = mapInfo.NumNaturalWonders;
    let iTilesPerLake = mapInfo.LakeGenerationFrequency;
    let iStartSectorRows = mapInfo.StartSectorRows;
    let iStartSectorCols = mapInfo.StartSectorCols;

    // Randomly choose which continent gets more players
    let iRandom = TerrainBuilder.getRandomNumber(2, "East or West");
    if (iRandom == 1) {
        [iNumPlayers1, iNumPlayers2] = [iNumPlayers2, iNumPlayers1];
    }

    let bHumanNearEquator = utilities.needHumanNearEquator();
    let startSectors = chooseStartSectors(iNumPlayers1, iNumPlayers2, 
                                        iStartSectorRows, iStartSectorCols, 
                                        bHumanNearEquator);

    // Generate the base landmasses with smiley features
    createSmileyLandmasses(iWidth, iHeight, westContinent, eastContinent, 
                          iStartSectorRows, iStartSectorCols, startSectors);

    // Standard map generation pipeline following engine rules
    TerrainBuilder.validateAndFixTerrain();
    expandCoasts(iWidth, iHeight);
    utilities.adjustOceanPlotTags(iNumPlayers1 > iNumPlayers2);
    AreaBuilder.recalculateAreas();
    TerrainBuilder.stampContinents();

    // Add terrain features
    addMountains(iWidth, iHeight);
    addVolcanoes(iWidth, iHeight);
    generateLakes(iWidth, iHeight, iTilesPerLake);
    
    // Build elevation and add hills
    AreaBuilder.recalculateAreas();
    TerrainBuilder.buildElevation();
    addHills(iWidth, iHeight);
    
    // Generate climate and rivers
    buildRainfallMap(iWidth, iHeight);
    TerrainBuilder.modelRivers(5, 15, globals.g_NavigableRiverTerrain);
    TerrainBuilder.validateAndFixTerrain();
    TerrainBuilder.defineNamedRivers();

    // Add biomes and features
    designateBiomes(iWidth, iHeight);
    addNaturalWonders(iWidth, iHeight, iNumNaturalWonders);
    TerrainBuilder.addFloodplains(4, 10);
    addFeatures(iWidth, iHeight);

    // Final terrain validation
    TerrainBuilder.validateAndFixTerrain();
    AreaBuilder.recalculateAreas();
    TerrainBuilder.storeWaterData();

    // Add snow, resources, and discoveries
    generateSnow(iWidth, iHeight);
    generateResources(iWidth, iHeight, westContinent, eastContinent, 
                     iNumPlayers1, iNumPlayers2);
    startPositions = assignStartPositions(iNumPlayers1, iNumPlayers2,
                                        westContinent, eastContinent,
                                        iStartSectorRows, iStartSectorCols,
                                        startSectors);
    generateDiscoveries(iWidth, iHeight, startPositions);

    // Final calculations
    FertilityBuilder.recalculate();
    assignAdvancedStartRegions();

    // Debug output
    dumpTerrain(iWidth, iHeight);
}

// Register listeners
engine.on('RequestMapInitData', requestMapData);
engine.on('GenerateMap', generateMap);

function createSmileyLandmasses(iWidth, iHeight, continent1, continent2, 
                              iStartSectorRows, iStartSectorCols, startSectors) {
    // Initialize fractal generator for base landmass
    FractalBuilder.create(globals.g_LandmassFractal, iWidth, iHeight, 2, 0);
    let iWaterHeight = FractalBuilder.getHeightFromPercent(globals.g_LandmassFractal, 
                                                          globals.g_WaterPercent);

    // Calculate eye and mouth positions for both continents
    let eyeRadius = Math.floor(iHeight / 12);
    let mouthWidth = Math.floor(iHeight / 6);
    let mouthHeight = Math.floor(iHeight / 12);

    // Process each plot on the map
    for (let iY = 0; iY < iHeight; iY++) {
        for (let iX = 0; iX < iWidth; iX++) {
            let terrain = globals.g_FlatTerrain;
            TerrainBuilder.setPlotTag(iX, iY, PlotTags.PLOT_TAG_NONE);

            // Check if we're in polar regions
            if (iY < continent1.south || iY >= continent1.north) {
                terrain = globals.g_OceanTerrain;
            }
            // Check if we're in the ocean between continents
            else if (iX < continent1.west || iX >= continent2.east ||
                    (iX >= continent1.east && iX < continent2.west)) {
                terrain = globals.g_OceanTerrain;
            }
            else {
                // Determine which continent we're processing
                let currentContinent = (iX < iWidth/2) ? continent1 : continent2;
                let continentCenterX = (currentContinent == continent1) ? 
                    (continent1.west + continent1.east) / 2 : 
                    (continent2.west + continent2.east) / 2;
                let continentCenterY = iHeight / 2;

                // Calculate positions for facial features
                let leftEyeX = continentCenterX - eyeRadius * 2;
                let rightEyeX = continentCenterX + eyeRadius * 2;
                let eyeY = continentCenterY + eyeRadius * 2;
                let mouthY = continentCenterY - eyeRadius * 2;

                // Create facial features as internal seas
                let isInFeature = false;
                
                // Check if we're in an eye
                let distanceToLeftEye = Math.sqrt(Math.pow(iX - leftEyeX, 2) + 
                                                Math.pow(iY - eyeY, 2));
                let distanceToRightEye = Math.sqrt(Math.pow(iX - rightEyeX, 2) + 
                                                  Math.pow(iY - eyeY, 2));
                
                // Check if we're in the mouth (curved shape)
                let distanceToMouthCenter = Math.sqrt(Math.pow(iX - continentCenterX, 2) + 
                                                    Math.pow(iY - mouthY, 2));
                let mouthCurve = Math.sin((iX - continentCenterX) / mouthWidth * Math.PI) * 
                                mouthHeight;
                
                if (distanceToLeftEye < eyeRadius || 
                    distanceToRightEye < eyeRadius ||
                    (Math.abs(iY - (mouthY + mouthCurve)) < mouthHeight/2 && 
                     Math.abs(iX - continentCenterX) < mouthWidth)) {
                    isInFeature = true;
                }

                // Apply fractal noise for natural-looking coastlines
                let iPlotHeight = utilities.getHeightAdjustingForStartSector(
                    iX, iY, iWaterHeight, globals.g_FractalWeight,
                    globals.g_CenterWeight, globals.g_StartSectorWeight,
                    continent1, continent2, iStartSectorRows, iStartSectorCols,
                    startSectors
                );

                // Set terrain type based on height and features
                if (isInFeature || iPlotHeight < iWaterHeight * globals.g_Cutoff) {
                    terrain = globals.g_OceanTerrain;
                }
            }

            // Add appropriate plot tags
            if (terrain != globals.g_OceanTerrain && terrain != globals.g_CoastTerrain) {
                utilities.addLandmassPlotTags(iX, iY, continent2.west);
            } else {
                utilities.addWaterPlotTags(iX, iY, continent2.west);
            }

            TerrainBuilder.setTerrainType(iX, iY, terrain);
        }
    }
}

function expandCoasts(iWidth, iHeight) {
    // Expands coastal water tiles around landmasses to create more natural-looking shores
    // and ensure proper naval navigation paths
    for (let iY = 0; iY < iHeight; iY++) {
        for (let iX = 0; iX < iWidth; iX++) {
            let terrain = GameplayMap.getTerrainType(iX, iY);
            if (terrain == globals.g_OceanTerrain) {
                // Check if this ocean tile is adjacent to any shallow water
                // If so, randomly convert it to coastal water to create varied coastlines
                if (GameplayMap.isAdjacentToShallowWater(iX, iY)) {
                    // Use 60% chance (0 or 1 from range of 0-2) to create coastal water
                    // This creates more natural-looking, varied coastlines
                    if (TerrainBuilder.getRandomNumber(2, "Coast Expansion") == 0) {
                        TerrainBuilder.setTerrainType(iX, iY, globals.g_CoastTerrain);
                    }
                }
            }
        }
    }
}

console.log("Loaded smiley-earth.ts");