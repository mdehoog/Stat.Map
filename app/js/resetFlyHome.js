/*global define*/
define([
    'Core/defined',
    'Core/Ellipsoid',
    'Core/Matrix4',
    'Core/Cartesian3',
    'Scene/SceneMode',
    'Widgets/createCommand'
], function(
    defined,
    Ellipsoid,
    Matrix4,
    Cartesian3,
    SceneMode,
    createCommand) {
    "use strict";

    var resetFlyHome = function(viewer) {
        var scene = viewer.scene;
        var homeViewModel = viewer.homeButton.viewModel;
        var oldHomeCommand = homeViewModel.command;
        var flyHome = function() {
            var mode = scene.mode;
            var controller = scene.screenSpaceCameraController;
            controller.ellipsoid = homeViewModel.ellipsoid;
            if (defined(scene) && mode === SceneMode.MORPHING) {
                scene.completeMorph();
            }
            if (mode === SceneMode.SCENE3D) {
                var maxRadii = Ellipsoid.WGS84.maximumRadius;
                var position = Cartesian3.fromDegrees(133.5, -27.0);
                position = Cartesian3.multiplyByScalar(Cartesian3.normalize(position, position), 2.5 * maxRadii, position);
                var direction = new Cartesian3();
                direction = Cartesian3.normalize(Cartesian3.negate(position, direction), direction);
                var right = new Cartesian3();
                right = Cartesian3.normalize(Cartesian3.cross(direction, Cartesian3.UNIT_Z, right), right);
                var up = Cartesian3.cross(right, direction, new Cartesian3());
                scene.camera.flyTo({
                    destination : position,
                    duration : homeViewModel.duration,
                    up : up,
                    direction : direction,
                    endTransform : Matrix4.IDENTITY
                });
            } else {
                oldHomeCommand();
            }
        };
        homeViewModel._command = createCommand(flyHome);

        flyHome();
    };

    return resetFlyHome;
});