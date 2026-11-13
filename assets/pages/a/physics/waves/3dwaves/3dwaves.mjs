import { colors, controlChanges, get, number, simulationClock, tau, write } from '../../workbench.mjs';
import { cubicImageSources, sphericalWaveComponents } from '../../models.mjs';

const THREE = window.THREE;
const host = get('wave-view');
const fallback = get('fallback-view');
const message = get('webgl-message');
const source = { x: 0, y: 0, z: 0 };
const cube = 4;
const half = cube / 2;
let images = [];
let waveNumber = 0;
let phase = 0;
let amplitude = .5;

function components(x, y, z) {
    return sphericalWaveComponents({ x, y, z }, images, waveNumber);
}

function fallbackView() {
    const ctx = fallback.getContext('2d');
    if (!ctx) throw new Error('2D Canvas unavailable');
    const size = 144;
    const raster = document.createElement('canvas');
    raster.width = raster.height = size;
    const rasterCtx = raster.getContext('2d');
    const image = rasterCtx.createImageData(size, size);
    const real = new Float32Array(size * size);
    const imaginary = new Float32Array(real.length);
    fallback.hidden = false;
    get('rotate').disabled = true;
    get('view-home').disabled = true;
    get('view').value = 'slice';
    get('view').disabled = true;
    message.textContent = 'WebGL 不可用，正在显示二维切面。';
    get('scene-caption').textContent = '浅青为正位移，蓝紫为负位移。橙点标记波源的投影位置。';

    return {
        rebuild() {
            const y = number('slice');
            for (let row = 0; row < size; row++) {
                for (let col = 0; col < size; col++) {
                    const index = row * size + col;
                    [real[index], imaginary[index]] = components(col * cube / (size - 1) - half, y, row * cube / (size - 1) - half);
                }
            }
        },
        paint() {
            const cosine = Math.cos(phase);
            const sine = Math.sin(phase);
            for (let i = 0; i < real.length; i++) {
                const value = (imaginary[i] * cosine - real[i] * sine) * amplitude;
                const contrast = Math.min(1, Math.abs(value) * 2);
                const tone = value >= 0 ? [128, 229, 219] : [168, 140, 255];
                image.data[i * 4] = 17 + (tone[0] - 17) * contrast;
                image.data[i * 4 + 1] = 28 + (tone[1] - 28) * contrast;
                image.data[i * 4 + 2] = 42 + (tone[2] - 42) * contrast;
                image.data[i * 4 + 3] = 255;
            }
            rasterCtx.putImageData(image, 0, 0);
            ctx.fillStyle = colors.background;
            ctx.fillRect(0, 0, fallback.width, fallback.height);
            const dimension = fallback.height;
            const x = (fallback.width - dimension) / 2;
            ctx.drawImage(raster, x, 0, dimension, dimension);
            ctx.beginPath();
            ctx.arc(x + (source.x + half) * dimension / cube, dimension / 2, 4, 0, tau);
            ctx.fillStyle = colors.amber;
            ctx.fill();
        },
    };
}

function volumeView() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 60);
    const orbit = new THREE.OrbitControls(camera, renderer.domElement);
    const home = new THREE.Vector3(5.5, 5.7, 7);
    camera.position.copy(home);
    orbit.minDistance = 4;
    orbit.maxDistance = 18;
    orbit.update();

    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(cube, cube, cube));
    scene.add(new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x9bb1c8, transparent: true, opacity: .5 })));
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffca81 }));
    scene.add(emitter);
    const uniforms = { phase: { value: 0 }, amplitude: { value: .5 }, pixelRatio: { value: 1 } };
    const fragmentShader = `
        uniform float phase;
        uniform float amplitude;
        varying vec2 field;
        void main() {
            float value = amplitude * (field.y * cos(phase) - field.x * sin(phase));
            vec3 background = vec3(0.067, 0.110, 0.165);
            vec3 tone = value >= 0.0 ? vec3(0.502, 0.898, 0.859) : vec3(0.659, 0.549, 1.0);
            float strength = clamp(abs(value) * 2.0, 0.0, 1.0);
            gl_FragColor = vec4(mix(background, tone, strength), 1.0);
        }`;
    const vertexShader = `
        attribute vec2 wave;
        uniform float pixelRatio;
        varying vec2 field;
        void main() {
            field = wave;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 2.4 * pixelRatio;
        }`;
    const plane = new THREE.PlaneGeometry(cube, cube, 58, 58);
    plane.rotateX(-Math.PI / 2);
    const cloud = new THREE.BufferGeometry();
    const positions = [];
    const cells = 20;
    for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
            for (let k = 0; k < cells; k++) {
                positions.push((i + .5) * cube / cells - half, (j + .5) * cube / cells - half, (k + .5) * cube / cells - half);
            }
        }
    }
    cloud.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    for (const geometry of [plane, cloud]) {
        geometry.setAttribute('wave', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    }

    const sliceMaterial = new THREE.ShaderMaterial({ uniforms, fragmentShader, vertexShader, side: THREE.DoubleSide });
    const cloudMaterial = new THREE.ShaderMaterial({
        uniforms, vertexShader, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        fragmentShader: fragmentShader.replace('gl_FragColor = vec4(mix(background, tone, strength), 1.0);',
            'if (length(gl_PointCoord - 0.5) > 0.48) discard; gl_FragColor = vec4(tone, strength * 0.72);'),
    });
    const slice = new THREE.Mesh(plane, sliceMaterial);
    const points = new THREE.Points(cloud, cloudMaterial);
    scene.add(slice, points);
    renderer.setClearColor(0x111c2a, 1);
    host.appendChild(renderer.domElement);
    message.hidden = true;

    function paint() {
        uniforms.phase.value = phase;
        uniforms.amplitude.value = amplitude;
        renderer.render(scene, camera);
    }

    const observer = new ResizeObserver(() => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        uniforms.pixelRatio.value = Math.min(devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(uniforms.pixelRatio.value);
        renderer.setSize(width, height, false);
        paint();
    });
    observer.observe(host);
    orbit.addEventListener('change', paint);
    const viewHome = () => {
        orbit.target.set(0, 0, 0);
        camera.position.copy(home);
        orbit.update();
        paint();
    };
    const rotate = () => {
        camera.position.sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6).add(orbit.target);
        orbit.update();
        paint();
    };
    get('rotate').addEventListener('click', rotate);
    get('view-home').addEventListener('click', viewHome);
    const loseContext = (event) => {
        event.preventDefault();
        observer.disconnect();
        orbit.dispose();
        get('rotate').removeEventListener('click', rotate);
        get('view-home').removeEventListener('click', viewHome);
        renderer.domElement.remove();
        message.hidden = false;
        installFallback();
    };
    renderer.domElement.addEventListener('webglcontextlost', loseContext, { once: true });

    return {
        rebuild() {
            const isSlice = get('view').value === 'slice';
            slice.visible = isSlice;
            points.visible = !isSlice;
            slice.position.y = number('slice');
            emitter.position.set(source.x, source.y, source.z);
            const geometry = isSlice ? plane : cloud;
            const y = isSlice ? slice.position.y : 0;
            const position = geometry.getAttribute('position');
            const wave = geometry.getAttribute('wave');
            for (let i = 0; i < position.count; i++) {
                const [real, imaginary] = components(position.getX(i), position.getY(i) + y, position.getZ(i));
                wave.setXY(i, real, imaginary);
            }
            wave.needsUpdate = true;
        },
        paint,
        viewHome,
    };
}

let view;
let clock;
function installFallback() {
    try {
        view = fallbackView();
        render();
    } catch {
        view = null;
        message.textContent = '浏览器无法绘制球面波。仍可调整参数并查看计算读数。';
        get('toggle-animation').disabled = true;
        get('rotate').disabled = true;
        get('view-home').disabled = true;
        clock?.pause();
    }
}

function render() {
    const wavelength = number('wavelength');
    const frequency = number('frequency');
    amplitude = number('amplitude');
    source.x = number('source-x');
    const order = number('order');
    waveNumber = tau / wavelength;
    images = cubicImageSources(order, cube, source);
    write('wavelength-output', wavelength.toFixed(1) + ' m');
    write('frequency-output', frequency.toFixed(1) + ' Hz');
    write('amplitude-output', amplitude.toFixed(1));
    write('order-output', String(order));
    write('source-x-output', source.x.toFixed(1) + ' m');
    write('slice-output', number('slice').toFixed(1) + ' m');
    write('image-count', String(images.length));
    write('speed', (wavelength * frequency).toFixed(2) + ' m/s');
    get('slice').disabled = get('view').value !== 'slice';
    view?.rebuild();
    view?.paint();
}

try {
    view = volumeView();
} catch {
    installFallback();
}
controlChanges(render);
get('experiment-form').addEventListener('reset', () => {
    phase = 0;
    view?.viewHome?.();
});
if (view) {
    clock = simulationClock(() => view?.paint(), (dt) => { phase = (phase + tau * number('frequency') * dt) % tau; });
}
render();
