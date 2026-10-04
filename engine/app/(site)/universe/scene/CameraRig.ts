import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';

export type CameraPose = {
  focus: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  distance: number;
};

export const PITCH_MIN = 0.06;
export const PITCH_MAX = 1.35;
export const DIST_MIN = 90;
export const DIST_MAX = 4200;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function clampPose(pose: CameraPose): CameraPose {
  pose.pitch = clamp(pose.pitch, PITCH_MIN, PITCH_MAX);
  pose.distance = clamp(pose.distance, DIST_MIN, DIST_MAX);
  return pose;
}

export function poseToPosition(pose: CameraPose, out: Vector3): Vector3 {
  const cp = Math.cos(pose.pitch);
  return out.set(
    pose.focus.x + Math.cos(pose.yaw) * cp * pose.distance,
    pose.focus.y + Math.sin(pose.pitch) * pose.distance,
    pose.focus.z + Math.sin(pose.yaw) * cp * pose.distance,
  );
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const copyPose = (p: CameraPose): CameraPose => ({ focus: { ...p.focus }, yaw: p.yaw, pitch: p.pitch, distance: p.distance });

type Flight = { from: CameraPose; to: CameraPose; start: number; ms: number };

export class CameraRig {
  pose: CameraPose = { focus: { x: 0, y: 0, z: 0 }, yaw: -0.4, pitch: 0.42, distance: 2600 };
  private target: CameraPose = copyPose(this.pose);
  private flight: Flight | null = null;
  private now = 0;
  private el: HTMLElement | null = null;
  private handlers: { onTap: (x: number, y: number) => void; onChange: () => void } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragDistance = 0;
  private pinchDistance = 0;
  private pinchStart = 0;
  private multiTouch = false;
  private readonly position = new Vector3();
  private readonly lookAt = new Vector3();
  private listeners: Array<[string, EventListener]> = [];

  constructor(private camera: PerspectiveCamera) {}

  nudge(d: { yaw?: number; pitch?: number; zoom?: number }): void {
    this.flight = null;
    this.target.yaw += d.yaw ?? 0;
    this.target.pitch += d.pitch ?? 0;
    if (d.zoom) this.target.distance *= Math.exp(-(d.zoom));
    clampPose(this.target);
    this.handlers?.onChange();
  }

  flyTo(to: Partial<CameraPose>, ms: number): void {
    const destination = clampPose({
      focus: { ...(to.focus ?? this.target.focus) },
      yaw: to.yaw ?? this.target.yaw,
      pitch: to.pitch ?? this.target.pitch,
      distance: to.distance ?? this.target.distance,
    });
    this.target = copyPose(destination);
    this.flight = { from: copyPose(this.pose), to: destination, start: this.now, ms: Math.max(1, ms) };
    this.handlers?.onChange();
  }

  /** Advance to `now` (ms). Returns true while the camera is still moving. */
  update(now: number, reduced: boolean): boolean {
    this.now = now;
    let moving = false;
    if (this.flight) {
      const t = reduced ? 1 : Math.min(1, (now - this.flight.start) / this.flight.ms);
      const k = easeInOutCubic(t);
      const { from, to } = this.flight;
      this.pose.focus.x = from.focus.x + (to.focus.x - from.focus.x) * k;
      this.pose.focus.y = from.focus.y + (to.focus.y - from.focus.y) * k;
      this.pose.focus.z = from.focus.z + (to.focus.z - from.focus.z) * k;
      this.pose.yaw = from.yaw + (to.yaw - from.yaw) * k;
      this.pose.pitch = from.pitch + (to.pitch - from.pitch) * k;
      this.pose.distance = from.distance + (to.distance - from.distance) * k;
      if (t >= 1) this.flight = null; else moving = true;
    } else {
      const ease = reduced ? 1 : 0.14;
      const step = (a: number, b: number) => a + (b - a) * ease;
      this.pose.yaw = step(this.pose.yaw, this.target.yaw);
      this.pose.pitch = step(this.pose.pitch, this.target.pitch);
      this.pose.distance = step(this.pose.distance, this.target.distance);
      this.pose.focus.x = step(this.pose.focus.x, this.target.focus.x);
      this.pose.focus.y = step(this.pose.focus.y, this.target.focus.y);
      this.pose.focus.z = step(this.pose.focus.z, this.target.focus.z);
      moving = Math.abs(this.pose.distance - this.target.distance) > 0.05
        || Math.abs(this.pose.yaw - this.target.yaw) > 0.0004
        || Math.abs(this.pose.pitch - this.target.pitch) > 0.0004
        || Math.abs(this.pose.focus.x - this.target.focus.x) > 0.05
        || Math.abs(this.pose.focus.y - this.target.focus.y) > 0.05
        || Math.abs(this.pose.focus.z - this.target.focus.z) > 0.05;
      if (!moving) {
        this.pose = copyPose(this.target);
      }
    }
    poseToPosition(this.pose, this.position);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt.set(this.pose.focus.x, this.pose.focus.y, this.pose.focus.z));
    return moving;
  }

  attach(el: HTMLElement, handlers: { onTap: (x: number, y: number) => void; onChange: () => void }): void {
    this.el = el;
    this.handlers = handlers;
    const local = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      el.setPointerCapture(event.pointerId);
      if (this.pointers.size === 0) this.multiTouch = false;
      this.pointers.set(event.pointerId, local(event));
      this.dragDistance = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.pinchStart = this.target.distance;
        this.multiTouch = true;
      }
    };
    const move = (event: PointerEvent) => {
      const before = this.pointers.get(event.pointerId);
      if (!before) return;
      const point = local(event);
      this.pointers.set(event.pointerId, point);
      if (this.pointers.size === 1) {
        const dx = point.x - before.x;
        const dy = point.y - before.y;
        this.dragDistance += Math.hypot(dx, dy);
        this.flight = null;
        this.target.yaw += dx * 0.0042;
        this.target.pitch = clamp(this.target.pitch + dy * 0.0034, PITCH_MIN, PITCH_MAX);
        this.handlers?.onChange();
      } else if (this.pointers.size === 2 && this.pinchDistance > 0) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.flight = null;
        this.target.distance = clamp(this.pinchStart * this.pinchDistance / distance, DIST_MIN, DIST_MAX);
        this.handlers?.onChange();
      }
    };
    const up = (event: PointerEvent) => {
      const point = local(event);
      if (!this.multiTouch && this.pointers.size === 1 && this.dragDistance < 9) {
        this.handlers?.onTap(point.x, point.y);
      }
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
    };
    const cancel = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      this.nudge({ zoom: event.deltaY * 0.0013 });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') this.nudge({ yaw: -0.12 });
      else if (event.key === 'ArrowRight') this.nudge({ yaw: 0.12 });
      else if (event.key === 'ArrowUp') this.nudge({ pitch: -0.1 });
      else if (event.key === 'ArrowDown') this.nudge({ pitch: 0.1 });
      else if (event.key === '+' || event.key === '=') this.nudge({ zoom: -0.22 });
      else if (event.key === '-') this.nudge({ zoom: 0.22 });
      else return;
      event.preventDefault();
    };
    const pairs: Array<[string, EventListener]> = [
      ['pointerdown', down as EventListener],
      ['pointermove', move as EventListener],
      ['pointerup', up as EventListener],
      ['pointercancel', cancel as EventListener],
      ['wheel', wheel as EventListener],
      ['keydown', key as EventListener],
    ];
    for (const [name, listener] of pairs) {
      el.addEventListener(name, listener, name === 'wheel' ? { passive: false } : undefined);
    }
    this.listeners = pairs;
  }

  detach(): void {
    if (!this.el) return;
    for (const [name, listener] of this.listeners) this.el.removeEventListener(name, listener);
    this.listeners = [];
    this.el = null;
    this.handlers = null;
    this.pointers.clear();
    this.dragDistance = 0;
    this.pinchDistance = 0;
    this.multiTouch = false;
  }
}
