/*global define*/
define([
	'Core/defaultValue',
	'Core/defined',
	'Core/GeometryPipeline',
	'Core/Geometry',
	'Core/DeveloperError',
    'Core/PolygonGeometry'
], function(
	defaultValue,
	defined,
	GeometryPipeline,
	Geometry,
	DeveloperError,
    PolygonGeometry) {
	"use strict";

	var BoundaryGeometry = function(options) {
		options = defaultValue(options, defaultValue.EMPTY_OBJECT);
		var objects = options.objects;
        var objectId = options.objectId;

		//>>includeStart('debug', pragmas.debug);
		if (!defined(objects)) {
			throw new DeveloperError('options.objects is required.');
		}
        if (!defined(objectId)) {
            throw new DeveloperError('options.objectId is required.');
        }
		//>>includeEnd('debug');

		this._objects = objects;
        this._objectId = objectId;
		this._workerName = 'createBoundaryGeometry';
	};

	BoundaryGeometry.createGeometry = function(boundaryGeometry) {
		var objects = boundaryGeometry._objects;
        var objectId = boundaryGeometry._objectId;
        var geometries = [];

        for (var i = 0; i < objects.length; i++) {
            var object = objects[i];
            var id = object.id;
            if(id != objectId) {
                continue;
            }
            var holes = object.holes;
            var holesArray = [];
            for(var j = 0; j < holes.length; j++) {
                holesArray.push({
                    positions : holes[i]
                });
            }
            var polygon = new PolygonGeometry({
                polygonHierarchy : {
                    positions : object.vertices,
                    holes : holesArray
                },
                extude : true,
                extrudedHeight : 1.0
            });
            var geometry = PolygonGeometry.createGeometry(polygon);
            geometries.push({
                geometry : geometry
            });
        }

        var geometry = GeometryPipeline.combine(geometries);
        return geometry;
	};

	return BoundaryGeometry;
});