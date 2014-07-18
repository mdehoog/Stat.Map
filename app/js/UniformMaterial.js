/*global define*/
define([
], function() {
    "use strict";

    var Material = function() {
        this.shaderSource = '';
        this.uniforms = {};
        this._uniforms = {};
    };

    Material.prototype.isTranslucent = function() {
        return false;
    };

    Material.prototype.update = function(context) {
    };

    Material.prototype.setUniform = function(uniform, value) {
        var that = this;
        this.uniforms[uniform] = value;
        this._uniforms[uniform] = function() {
            return that.uniforms[uniform];
        }
    };

    return Material;
});
