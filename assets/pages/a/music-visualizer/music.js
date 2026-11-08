import { sampleAudio } from './playback.mjs';

const stage = document.getElementById('container');
const scenePanel = document.getElementById('scenePanel');
const spectrogramPanel = document.getElementById('spectrogramPanel');
const modeButtons = [...document.querySelectorAll('[data-viz]')];
const rings = [];
const waves = [];
const spectrumBars = [];
let scene, camera, renderer, controls, particleSystem, particleColor, audioData;
let mode = 'spectrogram';
let colorScheme = 'neon';
let sceneFailed = false;

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a16);
    scene.fog = new THREE.Fog(0x0a0a16, 15, 50);
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    stage.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotateSpeed = 0.5;
    particleColor = new THREE.Color();

    initParticleSystem();
    initRings();
    initWaves();
    initSpectrum();

    new ResizeObserver(resizeScene).observe(stage);
}

function resizeScene() {
    if (!stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
}

function selectMode(nextMode) {
    mode = nextMode;
    const showPlot = mode === 'spectrogram';
    spectrogramPanel.hidden = !showPlot;
    scenePanel.hidden = showPlot;
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.viz === mode));
    if (showPlot || sceneFailed) return;
    try {
        if (!renderer) initScene();
        particleSystem.visible = mode === 'particles';
        for (const { mesh } of rings) mesh.visible = mode === 'rings';
        for (const { mesh } of waves) mesh.visible = mode === 'waves';
        for (const bar of spectrumBars) bar.visible = mode === 'spectrum';
        controls.autoRotate = mode !== 'spectrum' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        controls.target.set(0, 0, mode === 'spectrum' ? -10 : 0);
        camera.position.set(0, 5, 15);
        resizeScene();
    } catch {
        sceneFailed = true;
        stage.textContent = '此设备暂时无法显示三维画面，可以切换到滚动声谱。';
    }
}

for (const button of modeButtons) button.onclick = () => selectMode(button.dataset.viz);
document.getElementById('colorScheme').onchange = event => { colorScheme = event.target.value; };

function animate(now) {
    requestAnimationFrame(animate);
    const showPlot = mode === 'spectrogram';
    audioData = sampleAudio(now, showPlot);
    if (showPlot || !renderer || sceneFailed) return;
    const time = now / 1000;
    switch (mode) {
        case 'particles': updateParticles(time); break;
        case 'waves': updateWaves(time); break;
        case 'spectrum': updateSpectrum(); break;
        case 'rings': updateRings(time); break;
    }
    const average = audioData.reduce((sum, bin) => sum + bin, 0) / (audioData.length * 255);
    updateBackground(average, time);
    controls.update();
    renderer.render(scene, camera);
}

// 初始化粒子系统
function initParticleSystem() {
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    // 创建球形粒子分布
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // 球坐标
        const radius = 8 + Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        // 初始颜色 - 霓虹色调
        colors[i3] = 0.8 + Math.random() * 0.2;
        colors[i3 + 1] = 0.2 + Math.random() * 0.3;
        colors[i3 + 2] = 0.8 + Math.random() * 0.2;

        // 随机大小
        sizes[i] = 0.5 + Math.random() * 1.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // 粒子材质
    const material = new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

// 初始化光环
function initRings() {
    const ringCount = 5;
    const ringGeometry = new THREE.RingGeometry(3, 3.2, 64);

    for (let i = 0; i < ringCount; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i / ringCount, 1, 0.5),
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        const ring = new THREE.Mesh(ringGeometry, material);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = i * 1.5 - 3;

        scene.add(ring);
        rings.push({
            mesh: ring,
            baseRadius: 3 + i * 0.5,
            baseY: i * 1.5 - 3
        });
    }
}

// 初始化波形
function initWaves() {
    const waveCount = 3;
    const wavePoints = 64;

    for (let i = 0; i < waveCount; i++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(wavePoints * 3);

        for (let j = 0; j < wavePoints; j++) {
            const j3 = j * 3;
            const angle = (j / wavePoints) * Math.PI * 2;
            const radius = 5 + i * 1.5;

            positions[j3] = Math.cos(angle) * radius;
            positions[j3 + 1] = 0;
            positions[j3 + 2] = Math.sin(angle) * radius;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color().setHSL(0.7 - i * 0.1, 1, 0.6),
            transparent: true,
            opacity: 0.5
        });

        const wave = new THREE.Line(geometry, material);
        scene.add(wave);
        waves.push({
            mesh: wave,
            baseRadius: 5 + i * 1.5,
            baseY: -2 + i * 0.5
        });
    }
}

// 初始化频谱
function initSpectrum() {
    const barCount = 32;
    const barWidth = 0.2;
    const barSpacing = 0.3;
    const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;

    for (let i = 0; i < barCount; i++) {
        const geometry = new THREE.BoxGeometry(barWidth, 1, barWidth);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i / barCount, 1, 0.5),
            transparent: true,
            opacity: 0.7
        });

        const bar = new THREE.Mesh(geometry, material);
        bar.position.x = i * (barWidth + barSpacing) - totalWidth / 2;
        bar.position.y = 0.5;
        bar.position.z = -10;

        scene.add(bar);
        spectrumBars.push(bar);
    }
}

// 更新粒子
function updateParticles(time) {
    if (!particleSystem) return;

    const positions = particleSystem.geometry.attributes.position.array;
    const colors = particleSystem.geometry.attributes.color.array;
    const basePositions = particleSystem.geometry.attributes.position.originalArray;

    if (!basePositions) {
        // 保存原始位置
        particleSystem.geometry.attributes.position.originalArray = positions.slice();
        return;
    }

    for (let i = 0; i < positions.length; i += 3) {
        const particleIndex = i / 3;
        const frequencyIndex = Math.floor(particleIndex / positions.length * 3 * audioData.length) % audioData.length;
        const amplitude = audioData[frequencyIndex] / 256;

        // 根据音频数据调整粒子位置
        const waveEffect = Math.sin(time * 3 + particleIndex * 0.05) * amplitude * 1.5;

        positions[i] = basePositions[i] * (1 + amplitude * 0.2 + waveEffect * 0.1);
        positions[i + 1] = basePositions[i + 1] * (1 + amplitude * 0.2 + waveEffect * 0.1);
        positions[i + 2] = basePositions[i + 2] * (1 + amplitude * 0.2 + waveEffect * 0.1);

        // 根据色彩方案更新颜色
        updateParticleColor(colors, i, particleIndex, amplitude, time);
    }

    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.geometry.attributes.color.needsUpdate = true;
}

// 更新粒子颜色
function updateParticleColor(colors, index, particleIndex, amplitude, time) {
    let hue, saturation, lightness;

    switch (colorScheme) {
        case 'neon': // 霓虹
            hue = (particleIndex * 0.001 + time * 0.1) % 1;
            saturation = 1;
            lightness = 0.5 + amplitude * 0.3;
            break;

        case 'ocean': // 海洋
            hue = 0.55 + particleIndex * 0.0005;
            saturation = 0.8;
            lightness = 0.4 + amplitude * 0.4;
            break;

        case 'sunset': // 日落
            hue = 0.05 + particleIndex * 0.0003;
            saturation = 0.9;
            lightness = 0.5 + amplitude * 0.3;
            break;

        case 'forest': // 森林
            hue = 0.3 + particleIndex * 0.0002;
            saturation = 0.7;
            lightness = 0.4 + amplitude * 0.4;
            break;
    }

    const color = particleColor.setHSL(hue, saturation, lightness);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
}

// 更新光环
function updateRings(time) {
    rings.forEach((ring, index) => {
        const amplitude = audioData[Math.floor(index / rings.length * audioData.length)] / 256;

        // 调整光环半径
        ring.mesh.scale.setScalar(1 + amplitude * 0.5);

        // 调整光环不透明度
        ring.mesh.material.opacity = 0.3 + amplitude * 0.5;

        // 上下浮动
        ring.mesh.position.y = ring.baseY + Math.sin(time * 2 + index) * 0.5;

        // 根据色彩方案调整颜色
        updateRingColor(ring.mesh.material, index, time);
    });
}

// 更新光环颜色
function updateRingColor(material, index, time) {
    let hue;

    switch (colorScheme) {
        case 'neon':
            hue = (time * 0.05 + index * 0.1) % 1;
            break;
        case 'ocean':
            hue = 0.55 + index * 0.05;
            break;
        case 'sunset':
            hue = 0.05 + index * 0.05;
            break;
        case 'forest':
            hue = 0.3 + index * 0.05;
            break;
    }

    material.color.setHSL(hue, 1, 0.5);
}

// 更新波形
function updateWaves(time) {
    waves.forEach((wave, index) => {
        const positions = wave.mesh.geometry.attributes.position.array;
        const pointCount = positions.length / 3;

        for (let i = 0; i < pointCount; i++) {
            const i3 = i * 3;
            const angle = (i / pointCount) * Math.PI * 2;
            const radius = wave.baseRadius;

            const amplitude = audioData[Math.floor(i / pointCount * audioData.length)] / 256;
            const waveHeight = Math.sin(angle * 3 + time * 5) * amplitude * 2;

            positions[i3] = Math.cos(angle) * radius;
            positions[i3 + 1] = wave.baseY + waveHeight;
            positions[i3 + 2] = Math.sin(angle) * radius;
        }

        wave.mesh.geometry.attributes.position.needsUpdate = true;

        // 根据色彩方案调整颜色
        updateWaveColor(wave.mesh.material, index, time);
    });
}

// 更新波形颜色
function updateWaveColor(material, index, time) {
    let hue;

    switch (colorScheme) {
        case 'neon':
            hue = (time * 0.1 + index * 0.2) % 1;
            break;
        case 'ocean':
            hue = 0.6 - index * 0.1;
            break;
        case 'sunset':
            hue = 0.1 + index * 0.1;
            break;
        case 'forest':
            hue = 0.35 - index * 0.05;
            break;
    }

    material.color.setHSL(hue, 1, 0.6);
}

// 更新频谱
function updateSpectrum() {
    spectrumBars.forEach((bar, index) => {
        const amplitude = audioData[Math.floor(index / spectrumBars.length * audioData.length)] / 256;

        // 调整柱状高度
        bar.scale.y = 0.1 + amplitude * 5;
        bar.position.y = bar.scale.y / 2;

        // 根据色彩方案调整颜色
        updateBarColor(bar.material, index);
    });
}

// 更新频谱柱颜色
function updateBarColor(material, index) {
    let hue;

    switch (colorScheme) {
        case 'neon':
            hue = index / spectrumBars.length;
            break;
        case 'ocean':
            hue = 0.55 + index / spectrumBars.length * 0.2;
            break;
        case 'sunset':
            hue = 0.05 + index / spectrumBars.length * 0.2;
            break;
        case 'forest':
            hue = 0.3 + index / spectrumBars.length * 0.2;
            break;
    }

    material.color.setHSL(hue, 1, 0.5);
}

// 更新背景
function updateBackground(average, time) {
    let r, g, b;

    switch (colorScheme) {
        case 'neon':
            r = 0.04 + Math.sin(time * 0.5) * 0.01;
            g = 0.04;
            b = 0.1 + average * 0.1;
            break;
        case 'ocean':
            r = 0.02;
            g = 0.05 + average * 0.05;
            b = 0.1 + average * 0.1;
            break;
        case 'sunset':
            r = 0.08 + average * 0.05;
            g = 0.04;
            b = 0.02;
            break;
        case 'forest':
            r = 0.02;
            g = 0.07 + average * 0.05;
            b = 0.04;
            break;
    }

    scene.background.setRGB(r, g, b);
    scene.fog.color.setRGB(r, g, b);
}


requestAnimationFrame(animate);
