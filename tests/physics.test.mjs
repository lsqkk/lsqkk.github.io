import assert from 'node:assert/strict';
import test from 'node:test';
import {
    cubicImageSources,
    doubleSlitIntensity,
    mirrorIntersection,
    pendulumMeasurementsCsv,
    pendulumStep,
    refraction,
    smallAnglePeriod,
    sphericalWaveComponents,
} from '../assets/pages/a/physics/models.mjs';

const degrees = (angle) => angle * 180 / Math.PI;
const radians = (angle) => angle * Math.PI / 180;

test('refraction transitions through grazing incidence to total internal reflection', () => {
    const critical = Math.asin(1 / 1.5);
    const below = refraction(radians(40), 1.5, 1);
    assert(Math.abs(degrees(below.criticalAngle) - 41.8103) < 0.0001);
    assert(below.transmittedAngle > radians(40));
    assert(Math.abs(refraction(critical, 1.5, 1).transmittedAngle - Math.PI / 2) < 1e-7);
    assert.equal(refraction(radians(50), 1.5, 1).transmittedAngle, null);
    assert.equal(refraction(radians(50), 1, 1.5).criticalAngle, null);
});

test('double-slit peaks and minima follow the phase difference and envelope', () => {
    const wavelength = 550e-9;
    const slitSpacing = 200e-6;
    const slitWidth = 25e-6;
    const distance = 1.2;
    const position = (sine) => distance * sine / Math.sqrt(1 - sine ** 2);
    const intensityAt = (y) => doubleSlitIntensity(y, wavelength, slitSpacing, slitWidth, distance);
    assert.equal(intensityAt(0).intensity, 1);
    assert(intensityAt(position(wavelength / (2 * slitSpacing))).intensity < 1e-20);
    const peak = intensityAt(position(wavelength / slitSpacing));
    assert(Math.abs(peak.intensity - peak.envelope) < 1e-10);
    assert.equal(intensityAt(0.003).intensity, intensityAt(-0.003).intensity);
});

test('mirror intersection reflects only at the front and ignores a self-hit', () => {
    const mirror = { a: { x: -2, y: 0 }, b: { x: 2, y: 0 } };
    const diagonal = Math.SQRT1_2;
    const hit = mirrorIntersection({ x: -1, y: -1 }, { x: diagonal, y: diagonal }, mirror);
    assert(Math.abs(degrees(hit.incidence) - 45) < 1e-10);
    assert.deepEqual(hit.point, { x: 0, y: 0 });
    assert.deepEqual(hit.reflection, { x: diagonal, y: -diagonal });
    assert.equal(mirrorIntersection(hit.point, hit.reflection, mirror), null);
    assert.equal(mirrorIntersection({ x: 0, y: 1 }, { x: 0, y: -1 }, mirror).reflection, null);
    assert.equal(mirrorIntersection({ x: 3, y: -1 }, { x: 0, y: 1 }, mirror), null);
});

test('cubic mirror sources include each reflection order once', () => {
    const source = { x: .4, y: 0, z: 0 };
    const counts = [1, 7, 25, 63, 129];
    for (const [order, count] of counts.entries()) {
        const images = cubicImageSources(order, 4, source);
        assert.equal(images.length, count);
        assert.equal(new Set(images.map(({ x, y, z }) => [x, y, z].join(','))).size, count);
        assert.deepEqual(images.find((image) => image.weight === 1), { ...source, weight: 1 });
    }
    const images = cubicImageSources(1, 4, source);
    assert(images.some(({ x, y, z, weight }) => x === 3.6 && y === 0 && z === 0 && weight === .5));
    assert(images.some(({ x, y, z, weight }) => x === -4.4 && y === 0 && z === 0 && weight === .5));
    const [real, imaginary] = sphericalWaveComponents(source, cubicImageSources(0, 4, source), Math.PI);
    assert(Number.isFinite(real));
    assert.equal(imaginary, 0);
});

test('pendulum converges to the small-angle period and dissipates energy under damping', () => {
    const dt = 1 / 240;
    const length = 1;
    const gravity = 9.81;
    const angle0 = radians(5);
    let angle = angle0;
    let velocity = 0;
    const crossings = [];
    for (let elapsed = 0; elapsed < 5; elapsed += dt) {
        const previous = angle;
        [angle, velocity] = pendulumStep(angle, velocity, dt, length, gravity, 0);
        if (previous > 0 && angle <= 0) crossings.push(elapsed + dt * previous / (previous - angle));
    }
    assert.equal(crossings.length, 3);
    assert(Math.abs(crossings[1] - crossings[0] - smallAnglePeriod(length, gravity)) < .005);

    const energy = (theta, omega) => gravity * length * (1 - Math.cos(theta)) + (length * omega) ** 2 / 2;
    angle = radians(60);
    velocity = 0;
    const initialEnergy = energy(angle, velocity);
    for (let elapsed = 0; elapsed < 5; elapsed += dt) {
        [angle, velocity] = pendulumStep(angle, velocity, dt, length, gravity, .3);
    }
    assert(energy(angle, velocity) < initialEnergy / 2);
});

test('pendulum CSV retains two trials with their conditions and four-decimal periods', () => {
    const records = [
        { index: 1, cycle: 2, length: 1, gravity: 9.81, release: 24, damping: .08, measured: 2.0267, theoretical: 2.0061 },
        { index: 2, cycle: 1, length: .5, gravity: 1.62, release: 12, damping: 0, measured: 3.5006, theoretical: 3.4907 },
    ];
    assert.deepEqual(pendulumMeasurementsCsv(records).split('\r\n'), [
        'record,cycle,length_m,gravity_m_s2,release_angle_deg,damping_s_1,measured_period_s,theoretical_period_s',
        '1,2,1.00,9.81,24,0.08,2.0267,2.0061',
        '2,1,0.50,1.62,12,0.00,3.5006,3.4907',
        '',
    ]);
});

test('advanced optics models reproduce diffraction minima and reflected fringe orders', async () => {
    const { opticsLabs } = await import('../assets/pages/a/physics/optics-labs.mjs');
    const run = (slug, values) => {
        const lab = opticsLabs.find(item => item.slug === slug);
        return lab.model({ ...Object.fromEntries(lab.parameters.map(p => [p.id, p.value])), ...values });
    };
    const slit = run('single-slit', {});
    assert(slit.read(slit.extra[1] / 2) < 1e-20);
    const grating = run('diffraction-grating', { lambda: 532, d: 500, f: .5 });
    assert(grating.read(Math.asin(2 * 532 * 500 / 1e6) * 180 / Math.PI) < 1e-20);
    const wedge = run('equal-thickness', { g: 0 });
    assert(wedge.read(0) < 1e-20);
    assert(wedge.read(wedge.extra[1]) < 1e-20);
    assert(run('equal-inclination', { lambda: 532, d: 133 }).read(0) > 1 - 1e-12);
    assert(run('equal-inclination', { lambda: 532, d: 133.133 }).read(0) < 1e-20);
    assert(run('newton-rings', { lambda: 532, R: 1, g: 0 }).read(Math.sqrt(6 * .532)) < 1e-20);
});

test('advanced instrument models reproduce beam refocus, polarity and response limits', async () => {
    const { magneticBeam, magneticPoint, hallVoltage, photoelectricSignal, torsionResponse } =
        await import('../assets/pages/a/physics/advanced-labs.mjs');
    const beam = magneticBeam({ u: 400, b: 1.67, a: 10 });
    assert(Math.abs(beam.pitch - .25) < .003);
    for (const azimuth of [0, 1, 2, 3]) {
        const [, y, z] = magneticPoint(beam, beam.pitch, azimuth);
        assert(Math.hypot(y, z) < 1e-12);
    }
    assert.equal(hallVoltage(18, -.65, 1.5, .15, 1), hallVoltage(18, .65, 1.5, .15, -1));
    const signal = photoelectricSignal(365, 2.2, 60);
    assert.equal(signal.current(-signal.stopping), 0);
    assert.equal(signal.current(1), 6);
    assert.equal(photoelectricSignal(650, 2.2, 60).current(1), 0);
    assert.equal(torsionResponse(1, 1, .18).phase, Math.PI / 2);
    assert(torsionResponse(.97, 1, .18).amplitude > torsionResponse(.5, 1, .18).amplitude);
});
