/*global define*/
define([
    'Core/defined',
    'Core/formatError',
    'Core/getFilenameFromUri',
    'DynamicScene/CzmlDataSource',
    'DynamicScene/GeoJsonDataSource',
    'Scene/TileMapServiceImageryProvider',
    'Widgets/Viewer/viewerCesiumInspectorMixin',
    'Widgets/Viewer/viewerDragDropMixin',
    'Widgets/Viewer/viewerDynamicObjectMixin',
    'Widgets/Viewer/Viewer',
	'StatMap/GeoJsonDataSourceWithHoles',
    'StatMap/UnprojectedGeoJsonDataSource',
	'StatMap/BoundaryGeometry',
	'StatMap/BoundaryAppearance',
	'Cesium',
	'Core/Cartesian3',
	'Core/Math',
    'Core/Matrix4',
    'Core/Ellipsoid',
	'Core/Credit',
    'Scene/SceneMode',
    'Scene/Camera',
    'StatMap/resetFlyHome',
    'StatMap/DataLoader',
    'Core/loadJson',
    'ThirdParty/when',
    'domReady!'
], function (defined,
             formatError,
             getFilenameFromUri,
             CzmlDataSource,
             GeoJsonDataSource,
             TileMapServiceImageryProvider,
             viewerCesiumInspectorMixin,
             viewerDragDropMixin,
             viewerDynamicObjectMixin,
             Viewer,
			 GeoJsonDataSourceWithHoles,
             UnprojectedGeoJsonDataSource,
			 BoundaryGeometry,
			 BoundaryAppearance,
			 Cesium,
			 Cartesian3,
			 CesiumMath,
             Matrix4,
             Ellipsoid,
			 Credit,
             SceneMode,
             Camera,
             resetFlyHome,
             DataLoader,
             loadJson,
             when) {
	"use strict";
	/*global console*/

	/*
	 * 'debug'  : true/false,   // Full WebGL error reporting at substantial performance cost.
	 * 'lookAt' : CZML id,      // The CZML ID of the object to track at startup.
	 * 'source' : 'file.czml',  // The relative URL of the CZML file to load at startup.
	 * 'stats'  : true,         // Enable the FPS performance display.
	 * 'theme'  : 'lighter',    // Use the dark-text-on-light-background theme.
	 */
	var endUserOptions = {
		'theme': 'lighter',
		'stats': false,
		'inspector': false,
		'debug': false
	};

	var loadingIndicator = document.getElementById('loadingIndicator');
    var showLoadingIndicatorCount = 0;
    var showLoadingIndicator = function() {
        showLoadingIndicatorCount++;
        loadingIndicator.style.display = '';
    };
    var hideLoadingIndicator = function() {
        showLoadingIndicatorCount--;
        if(showLoadingIndicatorCount <= 0) {
            showLoadingIndicatorCount = 0;
            loadingIndicator.style.display = 'none';
        }
    };

	var imageryProvider = undefined;

	/*if (endUserOptions.tmsImageryUrl) {
		imageryProvider = new TileMapServiceImageryProvider({
			url: endUserOptions.tmsImageryUrl
		});
	}*/

	var viewer;
	try {
		viewer = new Viewer('cesiumContainer', {
            /*imageryProvider: new Cesium.WebMapServiceImageryProvider({
                url: 'http://www.ga.gov.au/gis/services/marine_coastal/Australian_Bathymetry_Topography/MapServer/WMSServer',
                layers : 'Australian_Bathymetry_Topography'
            }),
            baseLayerPicker : false,*/
            imageryProvider: imageryProvider,
            baseLayerPicker: !defined(imageryProvider),
            timeline: false,
            animation: false
        });
	} catch (exception) {
		loadingIndicator.style.display = 'none';
		var message = formatError(exception);
		console.error(message);
		if (!document.querySelector('.cesium-widget-errorPanel')) {
			window.alert(message);
		}
		return;
	}
    resetFlyHome(viewer);

    viewer.baseLayerPicker.viewModel.selectedImagery = viewer.baseLayerPicker.viewModel.imageryProviderViewModels[8];

	viewer.extend(viewerDragDropMixin);
	viewer.extend(viewerDynamicObjectMixin);
	if (endUserOptions.inspector) {
		viewer.extend(viewerCesiumInspectorMixin);
	}

	var showLoadError = function (name, error) {
		var title = 'An error occurred while loading the file: ' + name;
		var message = 'An error occurred while loading the file, which may indicate that it is invalid.  A detailed error report is below:';
		viewer.cesiumWidget.showErrorPanel(title, message, error);
	};

	viewer.dropError.addEventListener(function (viewerArg, name, error) {
		showLoadError(name, error);
	});

	var scene = viewer.scene;
	var context = scene.context;
	if (endUserOptions.debug) {
		context.validateShaderProgram = true;
		context.validateFramebuffer = true;
		context.logShaderCompilation = true;
		context.throwOnWebGLError = true;
	}
	if (endUserOptions.stats) {
		scene.debugShowFramesPerSecond = true;
	}

	var theme = endUserOptions.theme;
	if (defined(theme)) {
		if (endUserOptions.theme === 'lighter') {
			document.body.classList.add('cesium-lighter');
		} else {
			var error = 'Unknown theme: ' + theme;
			viewer.cesiumWidget.showErrorPanel(error, '');
		}
	}

    var dataLoader = new DataLoader(scene);
    viewer.clock.onTick.addEventListener(function(clock) {
        dataLoader.update(clock);
    });

    var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(function (movement) {
        var pickedObject = scene.pick(movement.endPosition);
        if (defined(pickedObject)) {
            //console.log(pickedObject.primitive);
            //TODO do something with the picked ASGS (like show a popup/tooltip)
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);


	//add credits
	scene.frameState.creditDisplay.addDefaultCredit(new Credit('ABS', 'img/abs_credit.png', 'http://stat.abs.gov.au/'));
	scene.frameState.creditDisplay.addDefaultCredit(new Credit('GovHack', 'img/govhack_credit.png', 'http://govhack.org/'));


    //load region topojson files
    showLoadingIndicator(); dataLoader.loadBoundaries('data/ASGS/ste_q1e6_s0.00001.json', 0, hideLoadingIndicator);
    showLoadingIndicator(); dataLoader.loadBoundaries('data/ASGS/sa4_q1e6_s0.000001.json', 1, hideLoadingIndicator);
    showLoadingIndicator(); dataLoader.loadBoundaries('data/ASGS/sa3_q1e6_s0.0000001.json', 2, hideLoadingIndicator);
    showLoadingIndicator(); dataLoader.loadBoundaries('data/ASGS/sa2_q1e6_s0.00000001.json', 3, hideLoadingIndicator);


    var loadDataset = function(url) {
        showLoadingIndicator(); dataLoader.loadStatistics(url, hideLoadingIndicator);
    }
    var datasetUrl = 'data/stats/ABS_NRP9_ASGS/summary.json';
    var datasetSelection = document.getElementById('datasetSelect');
    when(loadJson(datasetUrl), function(json) {
        datasetSelection.remove(0);
        var concepts = json['concepts'];
        var lastIndexOfSlash = datasetUrl.lastIndexOf('/');
        var pathUrl = datasetUrl.substring(0, lastIndexOfSlash);
        for(var i = 0; i < concepts.length; i++) {
            var concept = concepts[i];
            var name = concept['name'];
            var codes = concept['codes'];
            for(var j = 0; j < codes.length; j++) {
                var code = codes[j];
                var value = code['v'];
                var key = code['k'];
                var option = document.createElement('option');
                option.text = value;
                option.value = pathUrl + "/" + name + "." + key + ".json";
                datasetSelection.add(option);
            }
        }
        datasetSelection.onchange = function() {
            var url = datasetSelection.options[datasetSelection.selectedIndex].value;
            loadDataset(url);
        };
        datasetSelection.selectedIndex = 0;
        datasetSelection.onchange();
    }).otherwise(function(error) {
        var errorOption = document.createElement('option');
        errorOption.text = 'Error loading data: ' + error;
        datasetSelection.add(errorOption);
        datasetSelection.selectedIndex = 0;
        datasetSelection.disabled = true;
    });


    var regionTypeSelection = document.getElementById('regionTypeSelect');
    regionTypeSelection.remove(0);
    var regionTypes = [
        'State',
        'Statistical Areas Level 4',
        'Statistical Areas Level 3',
        'Statistical Areas Level 2'
    ];
    for(var i = 0; i < regionTypes.length; i++) {
        var option = document.createElement('option');
        option.text = regionTypes[i];
        option.value = "" + i;
        regionTypeSelection.add(option);
    }
    regionTypeSelection.onchange = function() {
        var level = regionTypeSelection.options[regionTypeSelection.selectedIndex].value;
        dataLoader.loadBoundariesAtLevel(level);
    };
    regionTypeSelection.selectedIndex = 2;
    regionTypeSelection.onchange();
});