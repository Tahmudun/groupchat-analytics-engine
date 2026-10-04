import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  CameraRig, DIST_MAX, DIST_MIN, PITCH_MAX, PITCH_MIN, clampPose, poseToPosition,
} from '@/app/(site)/universe/scene/CameraRig';

const pose = () => ({ focus: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.5, distance: 1000 });

describe('poseToPosition', () => {
  it('orbits the focus at the pose distance', () => {
    const p = pose();
    const out = poseToPosition(p, new Vector3());
    expect(out.length()).toBeCloseTo(1000, 4);
    expect(out.y).toBeCloseTo(Math.sin(0.5) * 1000, 4);
  });

  it('offsets from a moved focus', () => {
    const p = { ...pose(), focus: { x: 100, y: 50, z: -20 } };
    const out = poseToPosition(p, new Vector3());
    expect(out.distanceTo(new Vector3(100, 50, -20))).toBeCloseTo(1000, 4);
  });
});

describe('clampPose', () => {
  it('clamps pitch and distance to the traversal envelope', () => {
    const clamped = clampPose({ ...pose(), pitch: 3, distance: 99999 });
    expect(clamped.pitch).toBe(PITCH_MAX);
    expect(clamped.distance).toBe(DIST_MAX);
    const low = clampPose({ ...pose(), pitch: -3, distance: 1 });
    expect(low.pitch).toBe(PITCH_MIN);
    expect(low.distance).toBe(DIST_MIN);
  });
});

describe('CameraRig flights', () => {
  it('reaches the target exactly after the duration', () => {
    const rig = new CameraRig(new PerspectiveCamera(55, 1.6, 2, 20000));
    rig.update(0, false);
    rig.flyTo({ focus: { x: 300, y: 0, z: -100 }, distance: 640, pitch: 0.55 }, 800);
    rig.update(100, false);
    rig.update(900, false);
    expect(rig.pose.focus.x).toBeCloseTo(300, 3);
    expect(rig.pose.distance).toBeCloseTo(640, 3);
    expect(rig.pose.pitch).toBeCloseTo(0.55, 3);
  });

  it('cuts instantly under reduced motion', () => {
    const rig = new CameraRig(new PerspectiveCamera(55, 1.6, 2, 20000));
    rig.update(0, true);
    rig.flyTo({ distance: 500 }, 800);
    rig.update(1, true);
    expect(rig.pose.distance).toBeCloseTo(500, 6);
  });

  it('nudge respects clamps and settles (update eventually returns false)', () => {
    const rig = new CameraRig(new PerspectiveCamera(55, 1.6, 2, 20000));
    rig.update(0, false);
    rig.nudge({ zoom: -100 }); // huge dolly out gets clamped
    let moving = true;
    for (let t = 16; t < 8000 && moving; t += 16) moving = rig.update(t, false);
    expect(moving).toBe(false);
    expect(rig.pose.distance).toBeLessThanOrEqual(DIST_MAX);
  });
});
