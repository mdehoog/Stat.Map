    /*global define*/
    define(function() {
    "use strict";
    return "attribute vec3 position3DHigh;\n\
attribute vec3 position3DLow;\n\
attribute vec3 normal;\n\
attribute vec4 color;\n\
attribute float height;\n\
\n\
varying vec3 v_positionEC;\n\
varying vec3 v_normalEC;\n\
varying vec4 v_color;\n\
\n\
const float MAX_HEIGHT = 1000000.0;\n\
const float AT_LEAST_RADIUS = 6378137.0;\n\
const float BAKED_EXTRUSION = 1.0;\n\
\n\
void main()\n\
{\n\
    float visible = step(-0.5, height);\n\
    float topVertices = step(BAKED_EXTRUSION * 0.5, position2DLow.z + position2DHigh.z);\n\
    float eyeHeight3D = length(czm_viewerPositionWC) - AT_LEAST_RADIUS;\n\
    float eyeHeight2D = max(0.0, czm_viewerPositionWC.x);\n\
    float eyeHeight = mix(eyeHeight2D, eyeHeight3D, czm_morphTime);\n\
    float heightScale = min(MAX_HEIGHT, eyeHeight);\n\
    float addAmount = (height * heightScale - BAKED_EXTRUSION) * topVertices;\n\
    vec3 add3D = normalize(position3DLow + position3DHigh) * addAmount;\n\
    vec3 add2D = vec3(addAmount, 0.0, 0.0);\n\
    vec3 add = mix(add2D, add3D, czm_morphTime);\n\
    \n\
    vec4 p = czm_computePosition() + vec4(add, 0.0);\n\
    p = czm_modelViewRelativeToEye * p;\n\
    \n\
    v_positionEC = p.xyz;\n\
    v_normalEC = czm_normal * normal;\n\
    v_color = color;\n\
    \n\
    gl_Position = czm_projection * p * visible;\n\
}\n\
";
});