/*global define*/
define([
	'Core/defaultValue',
	'Core/defineProperties',
	'Core/VertexFormat',
	'StatMap/BoundaryAppearanceFS',
	'StatMap/BoundaryAppearanceVS',
	'Scene/Appearance'
], function(
	defaultValue,
	defineProperties,
	VertexFormat,
	BoundaryAppearanceFS,
	BoundaryAppearanceVS,
	Appearance) {
	"use strict";

	var BoundaryAppearance = function(options) {
		options = defaultValue(options, defaultValue.EMPTY_OBJECT);

		var translucent = defaultValue(options.translucent, true);
		var closed = defaultValue(options.closed, false);
		var flat = defaultValue(options.flat, false);
		//var vs = flat ? BoundaryFlatAppearanceVS : BoundaryAppearanceVS;
		//var fs = flat ? BoundaryFlatAppearanceFS : BoundaryAppearanceFS;
        var vs = BoundaryAppearanceVS;
        var fs = BoundaryAppearanceFS;
		var vertexFormat = flat ? BoundaryAppearance.FLAT_VERTEX_FORMAT : BoundaryAppearance.VERTEX_FORMAT;

		/**
		 * This property is part of the {@link Appearance} interface, but is not
		 * used by {@link PerInstanceColorAppearance} since a fully custom fragment shader is used.
		 *
		 * @type Material
		 *
		 * @default undefined
		 */
		this.material = undefined;

		/**
		 * When <code>true</code>, the geometry is expected to appear translucent so
		 * {@link PerInstanceColorAppearance#renderState} has alpha blending enabled.
		 *
		 * @type {Boolean}
		 *
		 * @default true
		 */
		this.translucent = translucent;

		this._vertexShaderSource = defaultValue(options.vertexShaderSource, vs);
		this._fragmentShaderSource = defaultValue(options.fragmentShaderSource, fs);
		this._renderState = defaultValue(options.renderState, Appearance.getDefaultRenderState(translucent, closed));
		this._closed = closed;

		// Non-derived members

		this._vertexFormat = vertexFormat;
		this._flat = flat;
		this._faceForward = defaultValue(options.faceForward, !closed);
	};

	defineProperties(BoundaryAppearance.prototype, {
		/**
		 * The GLSL source code for the vertex shader.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {String}
		 * @readonly
		 */
		vertexShaderSource : {
			get : function() {
				return this._vertexShaderSource;
			}
		},

		/**
		 * The GLSL source code for the fragment shader.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {String}
		 * @readonly
		 */
		fragmentShaderSource : {
			get : function() {
				return this._fragmentShaderSource;
			}
		},

		/**
		 * The WebGL fixed-function state to use when rendering the geometry.
		 * <p>
		 * The render state can be explicitly defined when constructing a {@link PerInstanceColorAppearance}
		 * instance, or it is set implicitly via {@link PerInstanceColorAppearance#translucent}
		 * and {@link PerInstanceColorAppearance#closed}.
		 * </p>
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {Object}
		 * @readonly
		 */
		renderState : {
			get : function() {
				return this._renderState;
			}
		},

		/**
		 * When <code>true</code>, the geometry is expected to be closed so
		 * {@link PerInstanceColorAppearance#renderState} has backface culling enabled.
		 * If the viewer enters the geometry, it will not be visible.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {Boolean}
		 * @readonly
		 *
		 * @default false
		 */
		closed : {
			get : function() {
				return this._closed;
			}
		},

		/**
		 * The {@link VertexFormat} that this appearance instance is compatible with.
		 * A geometry can have more vertex attributes and still be compatible - at a
		 * potential performance cost - but it can't have less.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type VertexFormat
		 * @readonly
		 */
		vertexFormat : {
			get : function() {
				return this._vertexFormat;
			}
		},

		/**
		 * When <code>true</code>, flat shading is used in the fragment shader,
		 * which means lighting is not taking into account.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {Boolean}
		 * @readonly
		 *
		 * @default false
		 */
		flat : {
			get : function() {
				return this._flat;
			}
		},

		/**
		 * When <code>true</code>, the fragment shader flips the surface normal
		 * as needed to ensure that the normal faces the viewer to avoid
		 * dark spots.  This is useful when both sides of a geometry should be
		 * shaded like {@link WallGeometry}.
		 *
		 * @memberof PerInstanceColorAppearance.prototype
		 *
		 * @type {Boolean}
		 * @readonly
		 *
		 * @default true
		 */
		faceForward : {
			get : function() {
				return this._faceForward;
			}
		}
	});

	/**
	 * The {@link VertexFormat} that all {@link PerInstanceColorAppearance} instances
	 * are compatible with.  This requires only <code>position</code> and <code>st</code>
	 * attributes.
	 *
	 * @type VertexFormat
	 *
	 * @constant
	 */
	BoundaryAppearance.VERTEX_FORMAT = VertexFormat.POSITION_AND_NORMAL;

	/**
	 * The {@link VertexFormat} that all {@link PerInstanceColorAppearance} instances
	 * are compatible with when {@link PerInstanceColorAppearance#flat} is <code>false</code>.
	 * This requires only a <code>position</code> attribute.
	 *
	 * @type VertexFormat
	 *
	 * @constant
	 */
	BoundaryAppearance.FLAT_VERTEX_FORMAT = VertexFormat.POSITION_ONLY;

	/**
	 * Procedurally creates the full GLSL fragment shader source.  For {@link PerInstanceColorAppearance},
	 * this is derived from {@link PerInstanceColorAppearance#fragmentShaderSource}, {@link PerInstanceColorAppearance#flat},
	 * and {@link PerInstanceColorAppearance#faceForward}.
	 *
	 * @function
	 *
	 * @returns String The full GLSL fragment shader source.
	 */
	BoundaryAppearance.prototype.getFragmentShaderSource = Appearance.prototype.getFragmentShaderSource;

	/**
	 * Determines if the geometry is translucent based on {@link PerInstanceColorAppearance#translucent}.
	 *
	 * @function
	 *
	 * @returns {Boolean} <code>true</code> if the appearance is translucent.
	 */
	BoundaryAppearance.prototype.isTranslucent = Appearance.prototype.isTranslucent;

	/**
	 * Creates a render state.  This is not the final {@link RenderState} instance; instead,
	 * it can contain a subset of render state properties identical to <code>renderState</code>
	 * passed to {@link Context#createRenderState}.
	 *
	 * @function
	 *
	 * @returns {Object} The render state.
	 */
	BoundaryAppearance.prototype.getRenderState = Appearance.prototype.getRenderState;

	return BoundaryAppearance;
});