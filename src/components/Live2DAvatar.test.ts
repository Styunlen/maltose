import { describe, it, expect } from "vitest";
import { computeFollowAngles, getBounds, clampToBounds, simulateSwimPath } from "./Live2DAvatar";

// 眼睛跟随角度计算（ADR-0027）：
// 鼠标在激活半径内按比例映射角度，半径外回正。
describe("computeFollowAngles", () => {
  it("returns zero at the avatar center", () => {
    const [yaw, pitch] = computeFollowAngles(0, 0);
    expect(yaw).toBe(0);
    expect(pitch).toBe(0);
  });

  it("yaws right for mouse on the right (positive dx)", () => {
    const [yaw, pitch] = computeFollowAngles(175, 0); // 半径 350 的一半
    expect(yaw).toBeGreaterThan(0); // 右 → 正 yaw
    expect(pitch).toBeCloseTo(0, 10);
    // 比例映射：ratio=0.5 → yaw = 0.5 * MAX_YAW = 0.25（头部只转头）
    expect(yaw).toBeCloseTo(0.25, 5);
  });

  it("yaws left for mouse on the left (negative dx)", () => {
    const [yaw] = computeFollowAngles(-175, 0);
    expect(yaw).toBeLessThan(0);
    expect(yaw).toBeCloseTo(-0.25, 5);
  });

  it("pitches down for mouse below (positive dy)", () => {
    const [, pitch] = computeFollowAngles(0, 175);
    expect(pitch).toBeGreaterThan(0); // 下方 → 正 pitch（背对模型低头）
    expect(pitch).toBeCloseTo(0.5 * 0.3, 5);
  });

  it("pitches up for mouse above (negative dy)", () => {
    const [, pitch] = computeFollowAngles(0, -175);
    expect(pitch).toBeLessThan(0); // 上方 → 负 pitch（背对模型抬头）
  });

  it("reaches MAX angle at the radius edge", () => {
    const [yaw] = computeFollowAngles(350, 0);
    expect(yaw).toBeCloseTo(0.5, 5); // MAX_YAW
  });

  it("returns zero beyond the radius", () => {
    const [yaw, pitch] = computeFollowAngles(351, 0);
    expect(yaw).toBe(0);
    expect(pitch).toBe(0);
  });

  it("combines yaw and pitch diagonally", () => {
    const [yaw, pitch] = computeFollowAngles(200, 200); // dist ≈ 283 < 350
    expect(yaw).toBeGreaterThan(0);
    expect(pitch).toBeGreaterThan(0); // 右下方 → yaw 正 + pitch 正
  });

  it("is symmetric: right vs left magnitudes equal", () => {
    const [ry] = computeFollowAngles(150, 0);
    const [ly] = computeFollowAngles(-150, 0);
    expect(ry).toBeCloseTo(-ly, 10);
  });
});

// 视口边界（ADR-0027 游动扩展）：translate 空间边界 + 反弹轨迹。
describe("getBounds", () => {
  it("computes translate bounds for bottom-right anchored container", () => {
    // vw=1200, vh=800, w=160, h=160, margin=16
    const b = getBounds(1200, 800, 160, 160, 16);
    expect(b.minTx).toBe(16 + 160 - 1200); // -1024
    expect(b.maxTx).toBe(16);
    expect(b.minTy).toBe(16 + 160 - 800); // -624
    expect(b.maxTy).toBe(16);
  });
});

describe("clampToBounds", () => {
  const b = getBounds(1200, 800, 160, 160, 16);
  it("clamps x and y within bounds", () => {
    expect(clampToBounds({ x: 9999, y: -9999 }, b)).toEqual({ x: 16, y: -624 });
    expect(clampToBounds({ x: -9999, y: 9999 }, b)).toEqual({ x: -1024, y: 16 });
  });
  it("keeps in-bounds values unchanged", () => {
    expect(clampToBounds({ x: -500, y: -300 }, b)).toEqual({ x: -500, y: -300 });
  });
});

describe("simulateSwimPath", () => {
  // 视口 1200x800, 容器 160x160, 起始在右下角附近 (offset 0,0)
  const b = getBounds(1200, 800, 160, 160, 16);
  const start = { x: 0, y: 0 };

  it("travels exactly `distance` path length (no bounce)", () => {
    // 起始在视口中心远离墙，向右 100px 不撞右墙（maxTx=16, 起始 -500 距墙 516px）
    const mid = { x: -500, y: -300 };
    const { points, final } = simulateSwimPath(mid, 0, 100, b, 1); // angle 0 → +x
    expect(points.length).toBe(101); // 起点 + 100 步
    expect(final.x).toBeCloseTo(100, 5);
    expect(final.y).toBe(0);
  });

  it("bounces off the right wall and reflects", () => {
    // 起始 tx=0（距右墙 16px）。向右 120px：先到墙（+16）反弹，剩余向左
    const { points, final } = simulateSwimPath(start, 0, 120, b, 1);
    expect(final.x).toBeLessThan(16); // 反弹后回到界内
    // 路径应经过边界点 (16, 0)（x 反弹处）
    const hitWall = points.some((p) => Math.abs(p.x - 16) < 1.5);
    expect(hitWall).toBe(true);
  });

  it("keeps all points within bounds", () => {
    const { points } = simulateSwimPath(start, 1.0, 200, b, 1); // 斜向，多次反弹
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(b.minTx);
      expect(p.x).toBeLessThanOrEqual(b.maxTx);
      expect(p.y).toBeGreaterThanOrEqual(b.minTy);
      expect(p.y).toBeLessThanOrEqual(b.maxTy);
    }
  });

  it("final position is within bounds after bouncing", () => {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const { final } = simulateSwimPath(start, angle, 150, b, 1);
      expect(final.x).toBeGreaterThanOrEqual(b.minTx);
      expect(final.x).toBeLessThanOrEqual(b.maxTx);
      expect(final.y).toBeGreaterThanOrEqual(b.minTy);
      expect(final.y).toBeLessThanOrEqual(b.maxTy);
    }
  });
});
