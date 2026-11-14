import { expose, spectralColor } from './optics-scenes.mjs';

export function mountOptics3D(container, slug) {
    if (slug !== 'newton-rings') throw new Error('Unsupported optics scene');
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '平凸透镜、平板与反射干涉条纹的可旋转模型');
    renderer.domElement.setAttribute('role', 'img');
    const scene = new T.Scene();
    scene.background = new T.Color('#0a1420');
    const camera = new T.PerspectiveCamera(40, 1, .1, 60);
    const orbit = new T.OrbitControls(camera, renderer.domElement);
    const start = new T.Vector3(5.7, 5.1, 7.2);
    orbit.minDistance = 4.4;
    orbit.maxDistance = 15;
    orbit.maxPolarAngle = Math.PI * .48;
    function home() {
        camera.position.copy(start);
        orbit.target.set(0, .55, 0);
        orbit.update();
    }
    home();
    orbit.addEventListener('change', () => renderer.render(scene, camera));

    const grid = new T.GridHelper(12, 24, '#426079', '#213449');
    grid.position.y = -.23;
    scene.add(grid);
    const base = new T.Mesh(new T.BoxGeometry(5.25, .19, 5.25), new T.MeshBasicMaterial({
        color: '#1e425c', transparent: true, opacity: .88,
    }));
    base.position.y = -.105;
    base.add(new T.LineSegments(new T.EdgesGeometry(base.geometry), new T.LineBasicMaterial({color: '#7299b2'})));
    scene.add(base);

    const sensor = document.createElement('canvas');
    sensor.width = sensor.height = 384;
    const sensorContext = sensor.getContext('2d');
    const texture = new T.CanvasTexture(sensor);
    const aperture = new T.Mesh(new T.CircleGeometry(2.12, 96), new T.MeshBasicMaterial({map: texture}));
    aperture.rotation.x = -Math.PI / 2;
    aperture.position.y = .006;
    scene.add(aperture);

    const lensGlass = new T.MeshBasicMaterial({color: '#83ccd9', transparent: true, opacity: .11,
        side: T.DoubleSide, depthWrite: false});
    const lens = new T.Group();
    lens.position.y = .075;
    const cap = new T.Mesh(new T.CircleGeometry(2.12, 96), lensGlass);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = .96;
    lens.add(cap);
    const geometry = new T.BufferGeometry();
    const spokes = 96, rings = 24;
    const positions = new Float32Array((rings + 2) * (spokes + 1) * 3);
    const indices = [];
    for (let r = 0; r <= rings + 1; r++) {
        for (let i = 0; i <= spokes; i++) {
            const index = r * (spokes + 1) + i;
            const angle = 2 * Math.PI * i / spokes;
            const radius = Math.min(1, r / rings) * 2.12;
            positions[3 * index] = Math.cos(angle) * radius;
            positions[3 * index + 2] = Math.sin(angle) * radius;
            if (r && i) {
                const prev = index - spokes - 1;
                indices.push(prev - 1, index, prev, prev - 1, index - 1, index);
            }
        }
    }
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    lens.add(new T.Mesh(geometry, lensGlass));
    const contourMaterial = new T.LineBasicMaterial({color: '#92cbe0', transparent: true, opacity: .68});
    const rimGeometry = new T.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) =>
        new T.Vector3(2.12 * Math.cos(i / 96 * 2 * Math.PI), 0, 2.12 * Math.sin(i / 96 * 2 * Math.PI))));
    const top = new T.Line(rimGeometry, contourMaterial);
    top.position.y = .96;
    const rim = new T.Line(rimGeometry, contourMaterial);
    lens.add(top, rim);
    scene.add(lens);

    const rayGeometry = new T.BufferGeometry();
    const rayPositions = new Float32Array(12);
    rayGeometry.setAttribute('position', new T.BufferAttribute(rayPositions, 3));
    const ray = new T.LineSegments(rayGeometry, new T.LineBasicMaterial({color: '#7ffaab'}));
    ray.frustumCulled = false;
    const pulse = new T.Mesh(new T.SphereGeometry(.057, 12, 9), new T.MeshBasicMaterial({color: '#e6fff2'}));
    const probe = new T.Mesh(new T.SphereGeometry(.058, 12, 9), new T.MeshBasicMaterial({color: '#ffd28f'}));
    scene.add(ray, pulse, probe);
    const path = Array.from({length: 3}, () => new T.Vector3());
    let lastOptics;
    let width = 0;
    let height = 0;
    function draw(p, model, clock) {
        const size = container.getBoundingClientRect();
        if (!size.width || !size.height) return;
        if (width !== size.width || height !== size.height) {
            width = size.width;
            height = size.height;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
        const opticalKey = [p.lambda, p.R, p.g].join('/');
        const sag = .51 / Math.sqrt(p.R / .4);
        if (opticalKey !== lastOptics) {
            expose(sensorContext, sensor.width, sensor.height, p.lambda, u => model.read(model.end * u), true);
            texture.needsUpdate = true;
            const color = spectralColor(p.lambda);
            ray.material.color.setRGB(...color.map(c => c / 255));
            for (let r = 0; r <= rings + 1; r++) {
                const y = r > rings ? .96 : sag * (r / rings) ** 2;
                for (let i = 0; i <= spokes; i++) positions[3 * (r * (spokes + 1) + i) + 1] = y;
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.computeBoundingSphere();
            lens.position.y = .06 + p.g / 2300;
            rim.position.y = sag;
            lastOptics = opticalKey;
        }
        const offset = model.at / model.end;
        path[0].set(offset * 2.12, 2.6, -1);
        path[1].set(offset * 2.12, .02, 0);
        path[2].set(offset * 2.12, 2.3, 1);
        [path[0], path[1], path[1], path[2]].forEach((point, i) => point.toArray(rayPositions, 3 * i));
        rayGeometry.attributes.position.needsUpdate = true;
        probe.position.copy(path[1]);
        const travel = (clock * .65) % 2;
        pulse.position.lerpVectors(path[Math.floor(travel)], path[Math.floor(travel) + 1], travel % 1);
        renderer.render(scene, camera);
    }
    return {
        draw,
        home,
        rotate() {
            camera.position.sub(orbit.target).applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 6).add(orbit.target);
            orbit.update();
        },
    };
}
