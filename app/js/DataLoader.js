/*global define*/
define([
    'Core/GeometryInstance',
    'Core/Matrix4',
    'Core/ColorGeometryInstanceAttribute',
    'Core/ShowGeometryInstanceAttribute',
    'Core/GeometryInstanceAttribute',
    'Core/Math',
    'Core/JulianDate',
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
    'StatMap/BoundaryAppearance',
    'StatMap/UniformMaterial'
], function(
    GeometryInstance,
    Matrix4,
    ColorGeometryInstanceAttribute,
    ShowGeometryInstanceAttribute,
    GeometryInstanceAttribute,
    CesiumMath,
    JulianDate,
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
    BoundaryAppearance,
    UniformMaterial) {
    "use strict";

    var DataLoader = function(scene) {
        this._scene = scene;
        this._geometries = {};
        this._statistics = {};
        this._error = new Event();
        this._statisticsDirty = false;
        this._boundaryLevel = -1;
        this._desiredBoundaryLevel = 0;
        this._switch = false;
        this._switchUp = true;
        this._switchTime = 1.0;
        this._switchStart = JulianDate.fromDate(new Date());
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
        }).otherwise(function (error) {
            //viewer.cesiumWidget.showErrorPanel(error, '');
            //throw new Cesium.DeveloperError(error);
            console.log(error);
        });
    };

    DataLoader.prototype.loadBoundariesAtLevel = function(level) {
        this._desiredBoundaryLevel = level;
    }

	var boundaryAppearance = new BoundaryAppearance({
		translucent: false,
		closed: false,
		flat: false
	});
    boundaryAppearance.material = new UniformMaterial();
    boundaryAppearance.material.setUniform('heightMorph', 0);

    DataLoader.prototype.refreshBoundaries = function() {
        var level = this._desiredBoundaryLevel;
        if(this._boundaryLevel == level) {
            return;
        }

        var geometries = this.geometries[level];
        if(!defined(geometries)) {
            return;
        }

        if(defined(this._primitive)) {
            this.scene.primitives.remove(this._primitive);
            this._primitive = undefined;
        }

        var instances = [];
        for (var i = 0; i < geometries.length; i++) {
            var geometry = geometries[i];
            var instance = new GeometryInstance({
                id: geometry.id,
                geometry: geometry.geometry,
                //geometry : GeometryPipeline.toWireframe(geometry.geometry),
                modelMatrix: Matrix4.IDENTITY,
                attributes: {
                    height1: new GeometryInstanceAttribute({
                        componentDatatype: ComponentDatatype.FLOAT,
                        componentsPerAttribute: 1,
                        normalize: false,
                        value: [0]
                    }),
                    height2: new GeometryInstanceAttribute({
                        componentDatatype: ComponentDatatype.FLOAT,
                        componentsPerAttribute: 1,
                        normalize: false,
                        value: [0]
                    }),
                    selected: new GeometryInstanceAttribute({
                        componentDatatype: ComponentDatatype.FLOAT,
                        componentsPerAttribute: 1,
                        normalize: false,
                        value: [0]
                    })
                }
            });
            instances.push(instance);
        }

        var primitive = new Primitive({
            geometryInstances: instances,
            appearance: boundaryAppearance,
            releaseGeometryInstances: true,
            interleave: true
        });
        this.scene.primitives.add(primitive);
        this._primitive = primitive;
        this._statisticsDirty = true;
        this._boundaryLevel = level;
    }

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
                attributes[this._switchUp ? 'height1' : 'height2'] = [valueNormalized];
            }
        }
        this._switch = true;

        var units = json['units'];
        units = units != null ? ' (' + units + ')' : '';
        var legendElement = document.getElementById('legend');
        var legendTopElement = document.getElementById('legendtop');
        var legendBottomElement = document.getElementById('legendbottom');
        legendElement.style.display = 'block';
        legendTopElement.innerHTML = max + units;
        legendBottomElement.innerHTML = min + units;
    };

    DataLoader.prototype.setSelected = function(id) {
        var primitive = this._primitive;
        if(!(defined(primitive) && defined(primitive._perInstanceAttributeLocations))) {
            return;
        }
        if(defined(this._selectedId)) {
            var attributes = primitive.getGeometryInstanceAttributes(this._selectedId);
            if(defined(attributes)) {
                attributes.selected = [0];
            }
        }
        if(defined(id)) {
            var attributes = primitive.getGeometryInstanceAttributes(id);
            if (defined(attributes)) {
                attributes.selected = [1];
            }
        }
        this._selectedId = id;
    };

    DataLoader.prototype.update = function(clock) {
        this.refreshBoundaries();
        this.refreshStatistics();

        if(this._switch) {
            this._switchStart = clock.currentTime;
            this._switch = false;
            this._switchUp = !this._switchUp;
        }
        var secondsPassed = JulianDate.getSecondsDifference(clock.currentTime, this._switchStart);
        var percent = Math.max(0, Math.min(1, secondsPassed / this._switchTime));
        percent = Math.sin(percent * Math.PI * 0.5);
        var heightMorph = this._switchUp ? percent : 1.0 - percent;
        boundaryAppearance.material.setUniform('heightMorph', heightMorph);
    };

    return DataLoader;
});
