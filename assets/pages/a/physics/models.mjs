const tau = 2 * Math.PI;

export function refraction(incidentAngle, sourceIndex, targetIndex) {
    const ratio = sourceIndex / targetIndex;
    const sine = Math.sin(incidentAngle) * ratio;
    return {
        transmittedAngle: sine > 1 + Number.EPSILON ? null : Math.asin(Math.min(sine, 1)),
        criticalAngle: ratio > 1 ? Math.asin(1 / ratio) : null,
        speedRatio: ratio,
    };
}

export function doubleSlitIntensity(y, wavelength, slitSpacing, slitWidth, distance) {
    const sine = y / Math.hypot(y, distance);
    const beta = Math.PI * slitWidth * sine / wavelength;
    const envelope = beta === 0 ? 1 : (Math.sin(beta) / beta) ** 2;
    const fringe = Math.cos(Math.PI * slitSpacing * sine / wavelength) ** 2;
    return { intensity: fringe * envelope, envelope };
}

export function smallAnglePeriod(length, gravity) {
    return tau * Math.sqrt(length / gravity);
}

export function pendulumMeasurementRow(record) {
    return [
        String(record.index),
        String(record.cycle),
        record.length.toFixed(2),
        record.gravity.toFixed(2),
        String(record.release),
        record.damping.toFixed(2),
        record.measured.toFixed(4),
        record.theoretical.toFixed(4),
    ];
}

export function pendulumMeasurementsCsv(records) {
    const header = 'record,cycle,length_m,gravity_m_s2,release_angle_deg,damping_s_1,measured_period_s,theoretical_period_s';
    return [header, ...records.map((record) => pendulumMeasurementRow(record).join(',')), ''].join('\r\n');
}

export function pendulumStep(angle, velocity, dt, length, gravity, damping) {
    const acceleration = (theta, omega) => -gravity / length * Math.sin(theta) - damping * omega;
    const a1 = acceleration(angle, velocity);
    const middleVelocity = velocity + a1 * dt / 2;
    const a2 = acceleration(angle + velocity * dt / 2, middleVelocity);
    return [angle + middleVelocity * dt, velocity + a2 * dt];
}

const cross = (a, b) => a.x * b.y - a.y * b.x;

export function mirrorIntersection(origin, direction, mirror) {
    const segment = { x: mirror.b.x - mirror.a.x, y: mirror.b.y - mirror.a.y };
    const delta = { x: mirror.a.x - origin.x, y: mirror.a.y - origin.y };
    const determinant = cross(direction, segment);
    if (Math.abs(determinant) < 1e-7) return null;
    const distance = cross(delta, segment) / determinant;
    const fraction = cross(delta, direction) / determinant;
    if (distance <= .01 || fraction < 0 || fraction > 1) return null;
    const length = Math.hypot(segment.x, segment.y);
    const normal = { x: segment.y / length, y: -segment.x / length };
    const projection = direction.x * normal.x + direction.y * normal.y;
    const incidence = projection < 0 ? Math.acos(Math.min(1, -projection)) : null;
    return {
        distance,
        point: { x: origin.x + distance * direction.x, y: origin.y + distance * direction.y },
        normal,
        incidence,
        reflection: incidence === null ? null : { x: direction.x - 2 * projection * normal.x, y: direction.y - 2 * projection * normal.y },
    };
}

export function cubicImageSources(order, sideLength, source) {
    const images = [];
    for (let i = -order; i <= order; i++) {
        for (let j = -order; j <= order; j++) {
            for (let k = -order; k <= order; k++) {
                const bounces = Math.abs(i) + Math.abs(j) + Math.abs(k);
                if (bounces > order) continue;
                images.push({
                    x: i * sideLength + (i % 2 ? -source.x : source.x),
                    y: j * sideLength + (j % 2 ? -source.y : source.y),
                    z: k * sideLength + (k % 2 ? -source.z : source.z),
                    weight: .5 ** bounces,
                });
            }
        }
    }
    return images;
}

export function sphericalWaveComponents(point, images, waveNumber) {
    let real = 0;
    let imaginary = 0;
    for (const image of images) {
        const distance = Math.hypot(point.x - image.x, point.y - image.y, point.z - image.z);
        const weight = image.weight / (distance + .24);
        real += Math.cos(waveNumber * distance) * weight;
        imaginary += Math.sin(waveNumber * distance) * weight;
    }
    return [real, imaginary];
}
