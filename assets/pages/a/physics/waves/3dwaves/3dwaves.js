const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x121212, 1);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('container').appendChild(renderer.domElement);

// 添加轨道控制
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 设置相机位置
camera.position.set(5, 5, 5);
controls.update();

// 添加环境光
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

// 添加方向光
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// 波参数
const waveParams = {
    wavelength: 1.5,
    frequency: 0.8,
    amplitude: 0.5,
    time: 0,
    isPaused: false,
    maxReflections: 2
};

// 立方体边界（不显示）
const cubeSize = 4;
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const cubeEdges = new THREE.EdgesGeometry(cubeGeometry);
const cubeLines = new THREE.LineSegments(cubeEdges, new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.3 }));
scene.add(cubeLines);

// 创建波的可视化点
const pointCount = 50000;
const pointGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(pointCount * 3);
const colors = new Float32Array(pointCount * 3);
const sizes = new Float32Array(pointCount);


// 在立方体内随机分布点
for (let i = 0; i < pointCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * cubeSize;
    positions[i3 + 1] = (Math.random() - 0.5) * cubeSize;
    positions[i3 + 2] = (Math.random() - 0.5) * cubeSize;

    // 初始颜色为深蓝色
    colors[i3] = 0.1;
    colors[i3 + 1] = 0.1;
    colors[i3 + 2] = 0.3;

    sizes[i] = 0.05;
}

pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
pointGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

// 创建点材质
const pointMaterial = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
});

const points = new THREE.Points(pointGeometry, pointMaterial);
scene.add(points);

// 获取UI元素
const wavelengthSlider = document.getElementById('wavelength');
const wavelengthValue = document.getElementById('wavelengthValue');
const frequencySlider = document.getElementById('frequency');
const frequencyValue = document.getElementById('frequencyValue');
const amplitudeSlider = document.getElementById('amplitude');
const amplitudeValue = document.getElementById('amplitudeValue');
const reflectionsSlider = document.getElementById('reflections');
const reflectionsValue = document.getElementById('reflectionsValue');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// 更新UI显示的值
function updateUIValues() {
    wavelengthValue.textContent = waveParams.wavelength.toFixed(1);
    frequencyValue.textContent = waveParams.frequency.toFixed(1);
    amplitudeValue.textContent = waveParams.amplitude.toFixed(1);
    reflectionsValue.textContent = waveParams.maxReflections;
}

// 初始化UI值
updateUIValues();

// 事件监听器
wavelengthSlider.addEventListener('input', function () {
    waveParams.wavelength = parseFloat(this.value);
    updateUIValues();
});

frequencySlider.addEventListener('input', function () {
    waveParams.frequency = parseFloat(this.value);
    updateUIValues();
});

amplitudeSlider.addEventListener('input', function () {
    waveParams.amplitude = parseFloat(this.value);
    updateUIValues();
});

reflectionsSlider.addEventListener('input', function () {
    waveParams.maxReflections = parseInt(this.value);
    updateUIValues();
});

pauseBtn.addEventListener('click', function () {
    waveParams.isPaused = !waveParams.isPaused;
    this.textContent = waveParams.isPaused ? '继续' : '暂停';
});

resetBtn.addEventListener('click', function () {
    waveParams.wavelength = 1.5;
    waveParams.frequency = 0.8;
    waveParams.amplitude = 0.5;
    waveParams.time = 0;
    waveParams.isPaused = false;
    waveParams.maxReflections = 2;

    wavelengthSlider.value = waveParams.wavelength;
    frequencySlider.value = waveParams.frequency;
    amplitudeSlider.value = waveParams.amplitude;
    reflectionsSlider.value = waveParams.maxReflections;
    pauseBtn.textContent = '暂停';

    updateUIValues();
});

// 计算波在点的值（考虑反射）
function calculateWaveValue(point, time) {
    const waveSource = new THREE.Vector3(0, 0, 0); // 波源在中心
    let totalValue = 0;

    // 直接波
    const directDistance = point.distanceTo(waveSource);
    const directPhase = (2 * Math.PI * directDistance / waveParams.wavelength) - (2 * Math.PI * waveParams.frequency * time);
    totalValue += Math.sin(directPhase) * waveParams.amplitude / (directDistance + 0.1); // 加上0.1避免除以零

    // 反射波
    if (waveParams.maxReflections > 0) {
        // 计算关于六个面的反射波源
        const reflectionSources = [];

        // 关于x=±2面的反射
        reflectionSources.push(new THREE.Vector3(4, 0, 0)); // x=2的反射
        reflectionSources.push(new THREE.Vector3(-4, 0, 0)); // x=-2的反射

        // 关于y=±2面的反射
        reflectionSources.push(new THREE.Vector3(0, 4, 0)); // y=2的反射
        reflectionSources.push(new THREE.Vector3(0, -4, 0)); // y=-2的反射

        // 关于z=±2面的反射
        reflectionSources.push(new THREE.Vector3(0, 0, 4)); // z=2的反射
        reflectionSources.push(new THREE.Vector3(0, 0, -4)); // z=-2的反射

        // 计算一次反射波
        for (let i = 0; i < reflectionSources.length; i++) {
            const reflectionDistance = point.distanceTo(reflectionSources[i]);
            const reflectionPhase = (2 * Math.PI * reflectionDistance / waveParams.wavelength) - (2 * Math.PI * waveParams.frequency * time);
            totalValue += Math.sin(reflectionPhase) * waveParams.amplitude * 0.5 / (reflectionDistance + 0.1); // 反射波振幅减半
        }

        // 计算二次反射波（如果允许）
        if (waveParams.maxReflections >= 2) {
            const secondReflectionSources = [];

            // 二次反射波源（关于两个面的反射）
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (i !== j) {
                        const secondReflection = new THREE.Vector3();
                        secondReflection.x = (i === 0) ? 4 : ((j === 0) ? 4 : 0);
                        secondReflection.y = (i === 1) ? 4 : ((j === 1) ? 4 : 0);
                        secondReflection.z = (i === 2) ? 4 : ((j === 2) ? 4 : 0);

                        // 确保不是原点或一次反射点
                        if (secondReflection.length() > 2) {
                            secondReflectionSources.push(secondReflection);
                        }
                    }
                }
            }

            // 计算二次反射波
            for (let i = 0; i < secondReflectionSources.length; i++) {
                const reflectionDistance = point.distanceTo(secondReflectionSources[i]);
                const reflectionPhase = (2 * Math.PI * reflectionDistance / waveParams.wavelength) - (2 * Math.PI * waveParams.frequency * time);
                totalValue += Math.sin(reflectionPhase) * waveParams.amplitude * 0.25 / (reflectionDistance + 0.1); // 二次反射波振幅再减半
            }
        }
    }

    return totalValue;
}

// 更新点的颜色和大小
function updatePoints() {
    const positions = pointGeometry.attributes.position.array;
    const colors = pointGeometry.attributes.color.array;
    const sizes = pointGeometry.attributes.size.array;

    for (let i = 0; i < pointCount; i++) {
        const i3 = i * 3;
        const point = new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]);

        // 计算波的值
        const waveValue = calculateWaveValue(point, waveParams.time);

        // 根据波的值设置颜色
        // 正值（波峰）为浅蓝色，负值（波谷）为深蓝色
        const intensity = (waveValue + 1) / 2; // 将值映射到0-1范围

        colors[i3] = 0.1 + intensity * 0.4;     // R
        colors[i3 + 1] = 0.1 + intensity * 0.6; // G
        colors[i3 + 2] = 0.3 + intensity * 0.7; // B

        // 根据波的值设置点的大小
        sizes[i] = Math.abs(waveValue) * 0.2;
    }

    pointGeometry.attributes.color.needsUpdate = true;
    pointGeometry.attributes.size.needsUpdate = true;
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);

    if (!waveParams.isPaused) {
        waveParams.time += 0.02;
        updatePoints();
    }

    controls.update();
    renderer.render(scene, camera);
}

// 处理窗口大小变化
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize, false);

// 启动动画
animate();