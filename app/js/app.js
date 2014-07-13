/*global require*/
require({
	baseUrl: '../../Cesium/Source',
	paths: {
        StatMap : '../../app/js',
		domReady: '../ThirdParty/requirejs-2.1.9/domReady'
	}
}, [
	'StatMap/StatMap'
], function () {
});