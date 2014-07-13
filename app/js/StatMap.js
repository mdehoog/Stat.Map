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
    'Scene/SceneMode',
    'Scene/Camera',
    'StatMap/resetFlyHome',
    'StatMap/DataLoader',
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
             SceneMode,
             Camera,
             resetFlyHome,
             DataLoader) {
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
		'stats': true,
		'inspector': false,
		'debug': false
	};

	var loadingIndicator = document.getElementById('loadingIndicator');

	var imageryProvider = undefined;

	/*if (endUserOptions.tmsImageryUrl) {
		imageryProvider = new TileMapServiceImageryProvider({
			url: endUserOptions.tmsImageryUrl
		});
	}*/

	var viewer;
	try {
		viewer = new Viewer('cesiumContainer', {
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
    dataLoader.loadBoundaries('data/ASGS/ste_q1e6_s0.00001.json', 0);
    dataLoader.loadBoundaries('data/ASGS/sa4_q1e6_s0.000001.json', 1);
    dataLoader.loadBoundaries('data/ASGS/sa3_q1e6_s0.0000001.json', 2);
    dataLoader.loadBoundaries('data/ASGS/sa2_q1e6_s0.00000001.json', 3);

    dataLoader.loadStatistics('data/stats/ABS_NRP9_ASGS/MEASURE.EC1.json');
    //dataLoader.loadStatistics('data/stats/ABS_CENSUS2011_B02/MEASURE.AHS.json');

    var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(function (movement) {
        var pickedObject = scene.pick(movement.endPosition);
        if (defined(pickedObject)) {
            //console.log(pickedObject.primitive);
            //TODO do something with the picked ASGS (like show a popup/tooltip)
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    //var startTime = undefined;
    viewer.clock.onTick.addEventListener(function(clock) {
        /*if(!defined(startTime))
        {
            startTime = clock.currentTime;
        }
        else
        {
            var elapsed = clock.currentTime.secondsOfDay - startTime.secondsOfDay;
        }*/

        dataLoader.update(clock);
    });

	loadingIndicator.style.display = 'none';
});