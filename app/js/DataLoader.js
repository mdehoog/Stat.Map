/*global define*/
define([
    'Core/GeometryInstance',
    'Core/Matrix4',
    'Core/ColorGeometryInstanceAttribute',
    'Core/ShowGeometryInstanceAttribute',
    'Core/GeometryInstanceAttribute',
    'Core/Math',
    'Core/ComponentDatatype',
    'Core/defineProperties',
    'Core/Color',
    'Core/defined',
    'Scene/Primitive',
    'Core/PolygonPipeline',
    'Core/GeometryPipeline',
    'Core/loadJson',
    'Core/Event',
    'ThirdParty/when',
    'StatMap/GeoJsonDataSourceWithHoles',
    'StatMap/BoundaryGeometry',
    'StatMap/BoundaryAppearance'
], function(
    GeometryInstance,
    Matrix4,
    ColorGeometryInstanceAttribute,
    ShowGeometryInstanceAttribute,
    GeometryInstanceAttribute,
    CesiumMath,
    ComponentDatatype,
    defineProperties,
    Color,
    defined,
    Primitive,
    PolygonPipeline,
    GeometryPipeline,
    loadJson,
    Event,
    when,
    GeoJsonDataSourceWithHoles,
    BoundaryGeometry,
    BoundaryAppearance) {
    "use strict";

    var DataLoader = function(scene) {
        this._scene = scene;
        this._geometries = {};
        this._statistics = {};
        this._error = new Event();
    };

    defineProperties(DataLoader.prototype, {
        scene : {
            get : function() {
                return this._scene;
            }
        },
        geometries : {
            get : function() {
                return this._geometries;
            }
        },
        statistics : {
            get : function() {
                return this._statistics;
            }
        },
        errorEvent : {
            get : function() {
                return this._error;
            }
        }
    });

    DataLoader.prototype.loadBoundaries = function(url, level, completedCallback) {
        var dataSource = new GeoJsonDataSourceWithHoles();
        var loadPromise = dataSource.loadUrl(url);
        var that = this;
        loadPromise.then(function () {

            completedCallback();

            //clean up dynamic objects created by the data source so that it's cloneable by the web worker
            var objectIds = [];
            var objectIdSet = {};
            var objects = dataSource.dynamicObjects._objects._array;
            var cleaned = [];

            for (var i = 0; i < objects.length; i++) {
                var object = objects[i];

                var vertexPositions = object.vertexPositions;
                if(!defined(vertexPositions)) {
                    continue;
                }
                var vertices = PolygonPipeline.removeDuplicates(vertexPositions._value);
                if(vertices.length < 3) {
                    continue;
                }

                //we have at least 3 vertices, so we can continue to create a geometry

                //keep track of the number of object ids, as we are creating a separate geometry for id:
                var objectId = object.geoJson.properties.id;
                if(!defined(objectIdSet[objectId])) {
                    objectIdSet[objectId] = "";
                    objectIds.push(objectId);
                }

                var clean = {};
                clean.id = objectId;
                clean.vertices = vertices;
                clean.holes = [];

                //clean up the holes as well
                var holes = object.holes;
                for(var j = 0; j < holes.length; j++) {
                    if (!defined(holes[i])) {
                        continue;
                    }
                    var hole = PolygonPipeline.removeDuplicates(holes[i]._value);
                    if(hole.length < 3) {
                        continue;
                    }
                    clean.holes.push(hole);
                }

                cleaned.push(clean);
            }

            var geometries = [];
            for(var i = 0; i < objectIds.length; i++) {
                var objectId = objectIds[i];
                var geometry = new BoundaryGeometry({
                    objects : cleaned,
                    objectId : objectId
                });
                geometries.push({
                    id : objectId,
                    geometry : geometry
                });
            }
            that.geometries[level] = geometries;


            if(level == 2) {
                var instances = [];

                for (var i = 0; i < geometries.length; i++) {
                    var geometry = geometries[i];
                    var instance = new GeometryInstance({
                        id: geometry.id,
                        //geometry: geometry.geometry,
                        geometry : GeometryPipeline.toWireframe(geometry.geometry),
                        modelMatrix: Matrix4.IDENTITY,
                        attributes: {
                            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
                            height: new GeometryInstanceAttribute({
                                componentDatatype: ComponentDatatype.FLOAT,
                                componentsPerAttribute: 1,
                                normalize: false,
                                value: [0]
                            })//,
                            //show: new ShowGeometryInstanceAttribute(false)
                        }
                    });
                    instances.push(instance);
                }

                var primitive = new Primitive({
                    geometryInstances: instances,
                    appearance: new BoundaryAppearance({
                        translucent: false,
                        closed: false,
                        flat: false
                    }),
                    releaseGeometryInstances: true,
                    interleave: true
                });
                that.scene.primitives.add(primitive);
                that._primitive = primitive;
            }
        }).otherwise(function (error) {
            //viewer.cesiumWidget.showErrorPanel(error, '');
            //throw new Cesium.DeveloperError(error);
            console.log(error);
        });
    };

    DataLoader.prototype.loadStatistics = function(url, completedCallback) {
        var that = this;
        return when(loadJson(url), function(json) {
            completedCallback();
            return that.loadStatisticsJson(json);
        }).otherwise(function(error) {
            that._error.raiseEvent(dataSource, error);
            return when.reject(error);
        });
    };

    DataLoader.prototype.loadStatisticsJson = function(json) {
        this._statisticsJson = json;
        this._statisticsDirty = true;
        this.refreshStatistics();
    };

    DataLoader.prototype.refreshStatistics = function() {
        if(!this._statisticsDirty) {
            return;
        }
        var primitive = this._primitive;
        if(!(defined(primitive) && defined(primitive._perInstanceAttributeLocations))) {
            return;
        }
        this._statisticsDirty = false;
        var json = this._statisticsJson;
        var data = json['data'];
        var times = json['times'];

        var dataIndex = times.length - 1; //use latest figures by default
        var min = Number.MAX_VALUE;
        var max = -Number.MAX_VALUE;
        var values = [];

        var primitiveIds = primitive._instanceIds;
        for(var i = 0; i < primitiveIds.length; i++) {
            var primitiveId = primitiveIds[i];
            var dataValues = data[primitiveId];
            if(defined(dataValues)) {
                var value = dataValues[dataIndex];
                if(value != null) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
                values.push(value);
            } else {
                values.push(null);
            }
        }

        for(var i = 0; i < primitiveIds.length; i++) {
            var value = values[i];
            var valueNormalized = value == null ? -1.0 : (value - min) / (max - min);
            var primitiveId = primitiveIds[i];
            var attributes = primitive.getGeometryInstanceAttributes(primitiveId);
            if(defined(attributes)) {
                //attributes.show = [value != null];
                attributes.height = [valueNormalized];
                var color = value == null ? Color.WHITE : Color.fromHsl((1.0 - valueNormalized) * 0.6666, 1.0, 0.5);
                attributes.color = new Uint8Array([
                    Color.floatToByte(color.red),
                    Color.floatToByte(color.green),
                    Color.floatToByte(color.blue),
                    Color.floatToByte(color.alpha)
                ]);
            }
        }
    };

    DataLoader.prototype.update = function(clock) {
        this.refreshStatistics();
    };

    return DataLoader;
});
