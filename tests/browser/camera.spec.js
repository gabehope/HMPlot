import { test, expect } from "./fixtures.js";

const camera = (page, key) => page.evaluate((key) => window.cameraFixture[key].getCamera(), key);
const project = (page, key, point) => page.evaluate(([key, point]) => window.cameraFixture.project(key, point), [key, point]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const length = (a) => Math.hypot(...a);
async function open(page) {
  await page.goto("/test/camera");
  await page.waitForFunction(() =>
    window.cameraFixture?.fly?.getCamera?.() && window.cameraFixture?.orbit?.getCamera?.() && window.cameraFixture?.lab?.getCamera?.());
}
const canvasBox = (page, index = 0) => page.locator('[aria-label="Plot canvas"]').nth(index).boundingBox();
// Drags end held still for 100 ms: a flyover drag released while moving glides on (TODO 66.6,
// flyoverMomentum, on by default; flyover.spec.js tests it), and these check where it stopped.
const still = (page) => page.waitForTimeout(100);
async function drag(page, box, dx, dy, button = "left", steps = 6) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps });
  await still(page);
  await page.mouse.up({ button });
}
async function dragFrom(page, from, dx, dy, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await still(page);
  await page.mouse.up();
}
const resetFly = (page) => page.evaluate(() => window.cameraFixture.fly.setCamera({ position: [0, 20, 120], target: [0, 0, 0] }));

test("camera props set the initial camera; getCamera reports it", async ({ page }) => {
  await open(page);
  const fly = await camera(page, "fly");
  expect(fly.position).toEqual([0, 20, 120]);
  expect(fly.target).toEqual([0, 0, 0]);
  expect(fly.mode).toBe("flyover");
  const orbit = await camera(page, "orbit");
  expect(orbit.position).toEqual([60, 40, 60].map((v) => expect.closeTo(v, 6))); // orbit recomputes via spherical coordinates
  expect(orbit.target).toEqual([5, 0, 0]);
  expect(orbit.fov).toBe(40);
});

test("flyover: a drag keeps the grabbed ground point under the pointer; right-drag looks", async ({ page }) => {
  await open(page);
  const ground = [12, 0, 25];
  const grabbed = await project(page, "fly", ground);
  const before = await camera(page, "fly");
  await dragFrom(page, grabbed, 150, 110, 10);
  const after = await project(page, "fly", ground);
  expect(Math.hypot(after.x - (grabbed.x + 150), after.y - (grabbed.y + 110))).toBeLessThan(1.5);
  const panned = await camera(page, "fly");
  const moved = sub(panned.position, before.position);
  expect(length(moved)).toBeGreaterThan(1);
  expect(Math.abs(moved[1])).toBeLessThan(1e-6); // height (y, the up axis) is unchanged
  expect(sub(panned.target, before.target)).toEqual(moved.map((v) => expect.closeTo(v, 6))); // target moves with it
  // Dragging in a loop returns to where it started (no drift).
  const start = await project(page, "fly", ground);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [dx, dy] of [[80, 0], [80, 60], [0, 60], [0, 0]]) await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
  await still(page);
  await page.mouse.up();
  const looped = await camera(page, "fly");
  expect(looped.position).toEqual(panned.position.map((v) => expect.closeTo(v, 3)));
  // Right-drag looks: position stays, direction changes, and the target re-seats on the ground.
  const box = await canvasBox(page);
  await drag(page, box, 60, 0, "right");
  const looked = await camera(page, "fly");
  expect(looked.position).toEqual(panned.position.map((v) => expect.closeTo(v, 6)));
  expect(sub(looked.target, looked.position)).not.toEqual(sub(panned.target, panned.position));
  expect(Math.abs(looked.target[1])).toBeLessThan(1e-6);
});

test("flyover: the wheel zooms toward the cursor, scroll down backs away, Shift triples the step", async ({ page }) => {
  await open(page);
  const ground = [-15, 0, 30];
  const under = await project(page, "fly", ground);
  const before = await camera(page, "fly");
  await page.mouse.move(under.x, under.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, before.position))).toBeGreaterThan(0.5);
  const zoomed = await camera(page, "fly");
  const after = await project(page, "fly", ground);
  expect(Math.hypot(after.x - under.x, after.y - under.y)).toBeLessThan(1.5);
  expect(length(sub(zoomed.position, ground))).toBeLessThan(length(sub(before.position, ground)));
  expect(zoomed.position[1]).toBeLessThan(before.position[1]); // descends toward the ground point
  expect(Math.abs(zoomed.target[1])).toBeLessThan(1e-6); // the target sits on the ground at the centre
  // Scrolling down moves away.
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, ground))).toBeGreaterThan(length(sub(zoomed.position, ground)));
  // Shift: the log step triples.
  await resetFly(page);
  const base = await camera(page, "fly");
  const anchor = [0, 0, 0];
  const centre = await project(page, "fly", anchor);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, base.position))).toBeGreaterThan(0.5);
  const plain = Math.log(length(sub(base.position, anchor)) / length(sub((await camera(page, "fly")).position, anchor)));
  await resetFly(page);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, base.position))).toBeGreaterThan(0.5);
  const shifted = Math.log(length(sub(base.position, anchor)) / length(sub((await camera(page, "fly")).position, anchor)));
  expect(shifted / plain).toBeCloseTo(3, 1);
});

test("flyover: a two-finger pinch zooms toward the midpoint and keeps the ground under it; one finger pans", async ({ page }) => {
  await open(page);
  // Real touch pointers through CDP (Chrome turns them into pointerType "touch" pointer events,
  // dispatched on the next frame, so the checks poll). Fingers are [x, y, id]; touchStart and
  // touchMove list the fingers that are down, touchEnd the fingers that lift.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  const fingers = (x, y, spread) => [[x - spread / 2, y, 0], [x + spread / 2, y, 1]];
  const offBy = async (point, x, y) => { const p = await project(page, "fly", point); return Math.hypot(p.x - x, p.y - y); };
  const distance = async (point) => length(sub((await camera(page, "fly")).position, point));
  const ground = [5, 0, 20];
  const mid = await project(page, "fly", ground);
  const before = await camera(page, "fly");
  // Spread from 80 to 200 px about a fixed midpoint: the point stays put and gets 2.5x closer.
  await touch("touchStart", fingers(mid.x, mid.y, 80).slice(0, 1));
  await touch("touchStart", fingers(mid.x, mid.y, 80));
  for (let i = 1; i <= 10; i++) await touch("touchMove", fingers(mid.x, mid.y, 80 + i * 12));
  await expect.poll(async () => length(sub(before.position, ground)) / await distance(ground)).toBeCloseTo(2.5, 2);
  expect(await offBy(ground, mid.x, mid.y)).toBeLessThan(1.5);
  const spreadOut = await camera(page, "fly");
  expect(spreadOut.position[1]).toBeLessThan(before.position[1]); // descends toward the point, as the wheel does
  // Pinch in while the midpoint moves: the point follows the midpoint and the camera backs away.
  for (let i = 1; i <= 10; i++) await touch("touchMove", fingers(mid.x + i * 6, mid.y + i * 3, 200 - i * 8));
  await expect.poll(() => offBy(ground, mid.x + 60, mid.y + 30)).toBeLessThan(1.5);
  await expect.poll(() => distance(ground)).toBeGreaterThan(length(sub(spreadOut.position, ground)));
  await page.waitForTimeout(100);
  const pinchedIn = await camera(page, "fly");
  // Lift one finger: nothing jumps, and the remaining finger drags the point under it.
  const [left, right] = fingers(mid.x + 60, mid.y + 30, 120);
  await touch("touchEnd", [left]);
  await page.waitForTimeout(100);
  expect((await camera(page, "fly")).position).toEqual(pinchedIn.position.map((v) => expect.closeTo(v, 6)));
  const held = await page.evaluate(([x, y]) => window.cameraFixture.groundAt("fly", x, y), right);
  expect(await offBy(held, right[0], right[1])).toBeLessThan(0.01);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [[right[0] - i * 10, right[1] + i * 5, 1]]);
  await touch("touchEnd", []);
  await expect.poll(() => offBy(held, right[0] - 80, right[1] + 40)).toBeLessThan(1.5);
  expect(Math.abs((await camera(page, "fly")).position[1] - pinchedIn.position[1])).toBeLessThan(1e-6); // a pan keeps the height
});

test("flySpeed scales the wheel and keys but not the drag", async ({ page }) => {
  await open(page);
  const ground = [12, 0, 25];
  const grabbed = await project(page, "fly", ground);
  const start = await camera(page, "fly");
  await dragFrom(page, grabbed, 120, 40);
  const slowPan = sub((await camera(page, "fly")).position, start.position);
  await resetFly(page);
  await page.mouse.move(grabbed.x, grabbed.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, start.position))).toBeGreaterThan(0.5);
  const slowZoom = length(sub((await camera(page, "fly")).position, start.position));
  await page.locator('[aria-label="Plot canvas"]').first().click();
  await resetFly(page);
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await page.keyboard.up("w");
  const slowKeys = length(sub((await camera(page, "fly")).position, start.position));
  await page.evaluate(() => window.cameraFixture.setSpeed(2));
  await page.waitForTimeout(100);
  await resetFly(page);
  await dragFrom(page, grabbed, 120, 40);
  const fastPan = sub((await camera(page, "fly")).position, start.position);
  expect(fastPan).toEqual(slowPan.map((v) => expect.closeTo(v, 3)));
  await resetFly(page);
  await page.mouse.move(grabbed.x, grabbed.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => length(sub((await camera(page, "fly")).position, start.position))).toBeGreaterThan(slowZoom * 1.5);
  await resetFly(page);
  await page.locator('[aria-label="Plot canvas"]').first().click();
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await page.keyboard.up("w");
  const fastKeys = length(sub((await camera(page, "fly")).position, start.position));
  expect(fastKeys / slowKeys).toBeGreaterThan(1.5);
  expect(fastKeys / slowKeys).toBeLessThan(2.7);
});

test("flyover ignores Cmd/Ctrl-held keys and does not pan on a plain hover after a mode switch", async ({ page }) => {
  await open(page);
  await page.locator('[aria-label="Plot canvas"]').first().click();
  const before = await camera(page, "fly");
  await page.keyboard.down("Meta");
  await page.keyboard.press("s");
  await page.waitForTimeout(250);
  await page.keyboard.up("Meta");
  expect((await camera(page, "fly")).position).toEqual(before.position);
  await page.keyboard.down("Control");
  await page.keyboard.press("w");
  await page.waitForTimeout(250);
  await page.keyboard.up("Control");
  expect((await camera(page, "fly")).position).toEqual(before.position);
  // A12: orbit -> flyover, click at once, then hover: the camera does not move.
  await page.evaluate(() => window.cameraFixture.setLab({ mode: "flyover" }));
  await expect.poll(async () => (await camera(page, "lab")).mode).toBe("flyover");
  const box = await canvasBox(page, 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const clicked = await camera(page, "lab");
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 5 });
  await page.waitForTimeout(100);
  expect((await camera(page, "lab")).position).toEqual(clicked.position);
});

test("setCamera round-trips, animates, notifies, and fit refits", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => window.cameraFixture.changes);
  await page.evaluate(() => window.cameraFixture.fly.setCamera({ position: [30, 10, 40], target: [1, 2, 3], fov: 35 }));
  const set = await camera(page, "fly");
  expect(set.position).toEqual([30, 10, 40]);
  expect(set.target).toEqual([1, 2, 3]);
  expect(set.fov).toBe(35);
  await expect.poll(() => page.evaluate(() => window.cameraFixture.changes)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.cameraFixture.last.position)).toEqual([30, 10, 40]);
  // Animated moves resolve at the destination.
  await page.evaluate(() => window.cameraFixture.fly.setCamera({ position: [0, 50, 90] }, { animate: true }));
  expect((await camera(page, "fly")).position.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 50, 90]);
  await expect(page.evaluate(() => window.cameraFixture.fly.setCamera({ position: [1, 2] }))).rejects.toThrow(/setCamera position must be/);
  await expect(page.evaluate(() => window.cameraFixture.fly.setCamera({ near: 0 }))).rejects.toThrow(/setCamera near must be a positive number/);
  await expect(page.evaluate(() => window.cameraFixture.fly.setCamera({ near: 5000 }))).rejects.toThrow(/setCamera near must be less than far/);
  // Two overlapping animated calls both settle: the first where it was, the second at its target.
  const settled = await page.evaluate(async () => {
    const fly = window.cameraFixture.fly;
    const first = fly.setCamera({ position: [40, 40, 40] }, { animate: true }).then(() => "first");
    await new Promise((r) => setTimeout(r, 30));
    const second = fly.setCamera({ position: [0, 20, 120] }, { animate: true }).then(() => "second");
    return Promise.all([first, second]);
  });
  expect(settled).toEqual(["first", "second"]);
  expect((await camera(page, "fly")).position.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 20, 120]);
  // fit() refits: explicit camera props are the fit target here, and zoom resets.
  await page.evaluate(() => window.cameraFixture.fly.setCamera({ zoom: 3, position: [5, 5, 5] }));
  expect((await camera(page, "fly")).zoom).toBe(3);
  await page.evaluate(() => window.cameraFixture.fly.fit());
  await expect.poll(async () => (await camera(page, "fly")).position).toEqual([0, 20, 120]);
  expect((await camera(page, "fly")).zoom).toBe(1);
});

test("changing cameraFov updates the projection matrix", async ({ page }) => {
  await open(page);
  const focal = () => page.evaluate(() => window.cameraFixture.focal("orbit"));
  expect(await focal()).toBeCloseTo(1 / Math.tan((40 * Math.PI) / 360), 5);
  await page.evaluate(() => window.cameraFixture.setFov(70));
  await expect.poll(focal).toBeCloseTo(1 / Math.tan((70 * Math.PI) / 360), 5);
  expect((await camera(page, "orbit")).fov).toBe(70);
});

test("orbit honors cameraUp at mount and when it changes later", async ({ page }) => {
  await open(page);
  // The lab plot mounts z-up at [100, 0, 30]: a horizontal orbit drag keeps z.
  const lab = await camera(page, "lab");
  expect(lab.up).toEqual([0, 0, 1]);
  await drag(page, await canvasBox(page, 2), 80, 0);
  const orbited = await camera(page, "lab");
  expect(orbited.position[2]).toBeCloseTo(30, 4);
  expect(length(sub(orbited.position, lab.position))).toBeGreaterThan(10);
  // A later cameraUp prop on the orbit plot is honored the same way.
  await page.evaluate(() => { window.cameraFixture.setOrbitUp([0, 0, 1]); window.cameraFixture.setOrbitPosition([100, 0, 30]); });
  await expect.poll(async () => (await camera(page, "orbit")).up).toEqual([0, 0, 1]);
  await drag(page, await canvasBox(page, 1), 80, 0);
  const later = await camera(page, "orbit");
  expect(later.position[2]).toBeCloseTo(30, 4);
  expect(length(sub(later.position, [100, 0, 30]))).toBeGreaterThan(10);
});

test("invalid camera props after mount report a render error and the camera keeps working", async ({ page }) => {
  await open(page);
  const near = (await camera(page, "lab")).near;
  await page.evaluate(() => window.cameraFixture.setLab({ near: 0 }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getRenderError())).toMatch(/cameraNear: near must be a positive number/);
  expect((await camera(page, "lab")).near).toBe(near);
  await page.evaluate(() => window.cameraFixture.lab.setCamera({ position: [50, 50, 50] }));
  expect((await camera(page, "lab")).position).toEqual([50, 50, 50].map((v) => expect.closeTo(v, 6)));
  await page.evaluate(() => window.cameraFixture.setLab({ near: 5000 }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getRenderError())).toMatch(/cameraNear: near must be less than far/);
  // A6: an explicit near, then cleared, returns to the scene-derived value. Clearing is null
  // (Python camera_near=None) or an emptied pane field; like every setting-backed Plot prop, an
  // undefined prop leaves the setting as it is.
  await page.evaluate(() => window.cameraFixture.setLab({ near: 50 }));
  await expect.poll(async () => (await camera(page, "lab")).near).toBe(50);
  expect(await page.evaluate(() => window.cameraFixture.lab.getRenderError())).toBe("");
  await page.evaluate(() => window.cameraFixture.setLab({ near: null }));
  await expect.poll(async () => (await camera(page, "lab")).near).toBeCloseTo(0.1, 6);
  await page.evaluate(() => window.cameraFixture.setLab({ near: 50 }));
  await expect.poll(async () => (await camera(page, "lab")).near).toBe(50);
  await page.evaluate(() => window.cameraFixture.lab.openSettings());
  const panel = page.getByRole("dialog", { name: "Settings · Lab", exact: true });
  await expect(panel).toBeVisible();
  for (const name of ["View", "Navigation"]) {
    const section = panel.locator("summary").filter({ hasText: new RegExp(`^${name}`) });
    if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
  }
  const nearField = panel.locator('[data-setting="plot.cameraNear"] input').first();
  await expect(nearField).toHaveValue("50");
  await nearField.fill("");
  await nearField.press("Enter");
  await expect.poll(async () => (await camera(page, "lab")).near).toBeCloseTo(0.1, 6);
  await page.evaluate(() => window.cameraFixture.lab.closeSettings());
  // A15: the tween uses the resolved animationDuration; 0 snaps an animated move. Read the camera
  // synchronously after the call (awaiting the promise would hide whether it animated).
  const animatedMove = (position) => page.evaluate(async (position) => {
    const done = window.cameraFixture.lab.setCamera({ position }, { animate: true });
    const now = window.cameraFixture.lab.getCamera().position;
    await done;
    return now;
  }, position);
  expect(length(sub(await animatedMove([30, 30, 30]), [30, 30, 30]))).toBeGreaterThan(1); // 300 ms: still at the start
  await page.evaluate(() => window.cameraFixture.setLab({ duration: 0 }));
  await page.waitForTimeout(50);
  expect(await animatedMove([20, 20, 20])).toEqual([20, 20, 20].map((v) => expect.closeTo(v, 6)));
});

test("navigation survives a 2D/3D remount under the same props; mode switches keep the target", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await open(page);
  await page.evaluate(() => window.cameraFixture.lab.setCamera({ position: [40, 40, 40], target: [1, 1, 0], fov: 33 }));
  await page.evaluate(() => window.cameraFixture.setLab({ type: "2d" }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getCamera() ?? null)).toBeNull();
  await page.evaluate(() => window.cameraFixture.setLab({ type: "3d" }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getCamera()?.position ?? null)).toEqual([40, 40, 40].map((v) => expect.closeTo(v, 4)));
  const restored = await camera(page, "lab");
  expect(restored.target).toEqual([1, 1, 0].map((v) => expect.closeTo(v, 4)));
  expect(restored.fov).toBe(33);
  // A changed prop still applies on a remount.
  await page.evaluate(() => window.cameraFixture.setLab({ type: "2d" }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getCamera() ?? null)).toBeNull();
  await page.evaluate(() => window.cameraFixture.setLab({ position: [60, 0, 30], type: "3d" }));
  await expect.poll(() => page.evaluate(() => window.cameraFixture.lab.getCamera()?.position ?? null)).toEqual([60, 0, 30].map((v) => expect.closeTo(v, 4)));
  // A17: camera props on a 2D plot warn once, however often it is 2D.
  expect(warnings.filter((text) => text.includes("apply only to 3D plots")).length).toBe(1);
  // A11: orbit -> flyover -> orbit keeps the target; A17: flyover makes the WebGPU canvas
  // focusable for its keys and takes the tabindex away again.
  const labCanvas = page.locator('[aria-label="Plot canvas"]').nth(2).locator("canvas").first();
  expect(await labCanvas.getAttribute("tabindex")).toBeNull();
  await page.evaluate(() => window.cameraFixture.lab.setCamera({ position: [100, 0, 30], target: [5, 0, 0] }));
  await page.evaluate(() => window.cameraFixture.setLab({ mode: "flyover" }));
  await expect.poll(async () => (await camera(page, "lab")).mode).toBe("flyover");
  expect((await camera(page, "lab")).target).toEqual([5, 0, 0].map((v) => expect.closeTo(v, 4)));
  expect(await labCanvas.getAttribute("tabindex")).toBe("0");
  await page.evaluate(() => window.cameraFixture.setLab({ mode: "orbit" }));
  await expect.poll(async () => (await camera(page, "lab")).mode).toBe("orbit");
  expect((await camera(page, "lab")).target).toEqual([5, 0, 0].map((v) => expect.closeTo(v, 4)));
  expect((await camera(page, "lab")).position).toEqual([100, 0, 30].map((v) => expect.closeTo(v, 4)));
  expect(await labCanvas.getAttribute("tabindex")).toBeNull();
  // A7: unmounting mid-animation rejects the pending setCamera instead of leaving it pending.
  const interrupted = await page.evaluate(() => {
    const moving = window.cameraFixture.lab.setCamera({ position: [70, 10, 70] }, { animate: true })
      .then(() => "resolved", (error) => error.message);
    window.cameraFixture.setLab({ type: "2d" });
    return moving;
  });
  expect(interrupted).toBe("camera transition interrupted");
});

test("the 3D minimap drag and axis buttons move the camera", async ({ page }) => {
  await open(page);
  const minimap = page.locator('[aria-label="3D navigation"]').first();
  await expect(minimap).toBeVisible();
  const before = await camera(page, "lab");
  const box = await minimap.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => length(sub((await camera(page, "lab")).position, before.position))).toBeGreaterThan(1);
  const dragged = await camera(page, "lab");
  await minimap.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => length(sub((await camera(page, "lab")).position, dragged.position))).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "View from positive X" }).click();
  await expect.poll(async () => {
    const state = await camera(page, "lab");
    const offset = sub(state.position, state.target);
    return Math.abs(offset[1]) + Math.abs(offset[2]);
  }).toBeLessThan(1e-3);
});

test("in flyover the minimap axis buttons keep up (the ground plane); top-down stops at the pitch clamp", async ({ page }) => {
  await open(page);
  // The lab plot is z-up: its ground is the x-y plane, and +Z is the top-down button.
  await page.evaluate(() => window.cameraFixture.setLab({ mode: "flyover" }));
  await expect.poll(async () => (await camera(page, "lab")).mode).toBe("flyover");
  const before = await camera(page, "lab");
  await page.getByRole("button", { name: "View from positive Z" }).click();
  await expect.poll(async () => length(sub((await camera(page, "lab")).position, before.position))).toBeGreaterThan(1);
  const top = await camera(page, "lab");
  expect(top.up).toEqual([0, 0, 1]);
  expect(top.target).toEqual(before.target.map((v) => expect.closeTo(v, 6)));
  const offset = sub(top.position, top.target);
  expect(offset[2] / length(offset)).toBeCloseTo(0.985, 6); // at the look pitch clamp
  // A drag after it still pans in the x-y ground plane: the height (z) does not change.
  const box = await canvasBox(page, 2);
  await drag(page, box, 60, 40);
  const dragged = await camera(page, "lab");
  expect(length(sub(dragged.position, top.position))).toBeGreaterThan(0.1);
  expect(dragged.position[2]).toBeCloseTo(top.position[2], 6);
  // A side view keeps up too (the orbit path writes a y-up up vector).
  await page.getByRole("button", { name: "View from positive X" }).click();
  await expect.poll(async () => {
    const state = await camera(page, "lab");
    const side = sub(state.position, state.target);
    return Math.abs(side[1]) + Math.abs(side[2]);
  }).toBeLessThan(1e-3);
  expect((await camera(page, "lab")).up).toEqual([0, 0, 1]);
});
