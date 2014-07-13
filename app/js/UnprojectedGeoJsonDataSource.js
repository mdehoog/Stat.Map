/*global define*/
define([
    'StatMap/GeoJsonDataSourceWithHoles',
    'Core/Cartesian3',
    'Core/defined',
    'Core/DeveloperError',
    'Core/loadJson',
	'ThirdParty/when',
], function(
	GeoJsonDataSourceWithHoles,
    Cartesian3,
    defined,
    DeveloperError,
    loadJson,
	when) {
    "use strict";

    function setLoading(dataSource, isLoading) {
        if (dataSource._isLoading !== isLoading) {
            dataSource._isLoading = isLoading;
            dataSource._loading.raiseEvent(dataSource, isLoading);
        }
    }

    var UnprojectedGeoJsonDataSource = function(name) {
        this.base = GeoJsonDataSourceWithHoles;
        this.base(name);
    };
    UnprojectedGeoJsonDataSource.prototype = new GeoJsonDataSourceWithHoles;

    var noReprojectionCrsName = 'noReprojection';
	GeoJsonDataSourceWithHoles.crsNames[noReprojectionCrsName] = function (coordinates) {
        return Cartesian3.fromElements(coordinates[0], coordinates[1], coordinates[2]);
    };

    UnprojectedGeoJsonDataSource.prototype.loadUrlUnprojected = function(url) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(url)) {
            throw new DeveloperError('url is required.');
        }
        //>>includeEnd('debug');

        setLoading(this, true);

        var dataSource = this;
        return when(loadJson(url), function(geoJson) {
            return dataSource.loadUnprojected(geoJson, url);
        }).otherwise(function(error) {
            setLoading(dataSource, false);
            dataSource._error.raiseEvent(dataSource, error);
            return when.reject(error);
        });
    };

    UnprojectedGeoJsonDataSource.prototype.loadUnprojected = function(geoJson, sourceUri) {
        geoJson.crs = {};
        geoJson.crs.properties = {};
        geoJson.crs.type = 'name';
        geoJson.crs.properties.name = noReprojectionCrsName;
        return this.load(geoJson, sourceUri);
    };

    return UnprojectedGeoJsonDataSource;
});
