import { magneticPoint } from './advanced-labs.mjs';

const length = 6;
const beamColor = 0x68efd7;
const coilColor = 0xc78b5f;
const screenColor = 0x9db6fc;
const turn = 2 * Math.PI;

// All spatial axes share a scale of 10 scene units per metre.
const point = (beam, x, azimuth) => magneticPoint(beam, x, azimuth).map((value, i) => value * 10 - (i ? 0 : length / 2));

export function mountMagnetic3D(container) {
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1727);
    const camera = new THREE.PerspectiveCamera(37, 1, .1, 65);
    const canvas = renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '螺线管、电子轨迹和可移动探测屏的三维模型');
    const orbit = new THREE.OrbitControls(camera, canvas);
    orbit.enablePan = false;
    orbit.minDistance = 3;
    orbit.maxDistance = 19;
    const homePosition = new THREE.Vector3(3.1, 4.9, 8.8);
    camera.position.copy(homePosition);
    orbit.update();

    const grid = new THREE.GridHelper(9, 18, 0x365674, 0x253b52);
    grid.position.y = -1.14;
    scene.add(grid);
    scene.add(new THREE.HemisphereLight(0xd1e6ff, 0x8b6153, 1.5));
    const key = new THREE.DirectionalLight(0xccdeff, 1.6);
    key.position.set(-2, 5, 4);
    scene.add(key);

    const coilMaterial = new THREE.MeshStandardMaterial({ color: coilColor, metalness: .45, roughness: .43, transparent: true, opacity: .7 });
    const coil = new THREE.TorusGeometry(1.07, .024, 7, 64);
    for (let i = 0; i < 14; i++) {
        const winding = new THREE.Mesh(coil, coilMaterial);
        winding.rotation.y = Math.PI / 2;
        winding.position.x = -2.9 + i * .445;
        scene.add(winding);
    }

    const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.22, 0, 0), new THREE.Vector3(3.22, 0, 0)
    ]), new THREE.LineDashedMaterial({ color: 0x8ba9c6, transparent: true, opacity: .48, dashSize: .12, gapSize: .12 }));
    axis.computeLineDistances();
    scene.add(axis);
    const fieldArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-2.8, 1.37, 0), 1.2, coilColor, .24, .11);
    scene.add(fieldArrow);

    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(.16, .19, .28, 24), new THREE.MeshStandardMaterial({
        color: coilColor, emissive: 0x53301d, metalness: .4, roughness: .4
    }));
    emitter.rotation.z = Math.PI / 2;
    emitter.position.x = -3.15;
    scene.add(emitter);

    const screen = new THREE.Group();
    screen.rotation.y = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(1.04, 72), new THREE.MeshBasicMaterial({
        color: screenColor, side: THREE.DoubleSide, transparent: true, opacity: .13, depthWrite: false
    }));
    const border = new THREE.Mesh(new THREE.TorusGeometry(1.04, .025, 8, 72), new THREE.MeshBasicMaterial({ color: screenColor }));
    screen.add(glass, border);
    scene.add(screen);

    const particleGeometry = new THREE.SphereGeometry(.034, 10, 8);
    const bright = new THREE.MeshBasicMaterial({ color: beamColor });
    const dim = new THREE.LineBasicMaterial({ color: beamColor, transparent: true, opacity: .35 });
    const samples = 190;
    const rays = Array.from({ length: 14 }, (_, index) => {
        const geometry = new THREE.BufferGeometry();
        const positions = new THREE.BufferAttribute(new Float32Array((samples + 1) * 3), 3);
        geometry.setAttribute('position', positions);
        const line = new THREE.Line(geometry, dim);
        line.frustumCulled = false;
        const particle = new THREE.Mesh(particleGeometry, bright);
        const hit = new THREE.Mesh(particleGeometry, bright);
        scene.add(line, particle, hit);
        return { positions, particle, hit, azimuth: turn * index / 14 };
    });

    const render = () => renderer.render(scene, camera);
    const resize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setSize(width, height, false);
        render();
    };
    container.append(canvas);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    orbit.addEventListener('change', render);
    resize();

    let geometryKey;
    return {
        draw(p, model, clock) {
            const nextKey = [p.u, p.b, p.a].join(':');
            const changed = geometryKey !== nextKey;
            geometryKey = nextKey;
            const distance = p.x / 100;
            screen.position.x = distance * 10 - 3;
            for (const [index, ray] of rays.entries()) {
                if (changed) {
                    for (let j = 0; j <= samples; j++) {
                        ray.positions.setXYZ(j, ...point(model.beam, .6 * j / samples, ray.azimuth));
                    }
                    ray.positions.needsUpdate = true;
                }
                ray.particle.position.set(...point(model.beam, .6 * ((clock * .36 + index * .17) % 1), ray.azimuth));
                ray.hit.position.set(...point(model.beam, distance, ray.azimuth));
            }
            render();
        },
        home() {
            orbit.target.set(0, 0, 0);
            camera.position.copy(homePosition);
            orbit.update();
            render();
        },
        rotate() {
            camera.position.sub(orbit.target).applyAxisAngle(camera.up, Math.PI / 6).add(orbit.target);
            orbit.update();
            render();
        }
    };
}
