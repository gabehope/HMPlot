import test from "node:test";
import assert from "node:assert/strict";
import { createGesture } from "../../src/lib/plot/utils/gesture.js";
import { createLoopGuard } from "../../src/lib/plot/utils/viewLoopGuard.js";

// TODO 136.8: the view's gesture and its loop guard.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("a gesture is a drag or a wheel burst, and whenIdle resolves at its end", async () => {
  const gesture = createGesture({ wheelIdle: 20 }),
    seen = [];
  gesture.onChange((active) => seen.push(active));
  gesture.press(1);
  assert.equal(gesture.active, false, "a press that does not move is a click");
  gesture.release(1);
  gesture.move(1);
  assert.equal(
    gesture.active,
    false,
    "a pointer that is not pressed only hovers",
  );
  gesture.press(1);
  gesture.move(1);
  gesture.move(1);
  assert.equal(gesture.active, true);
  let idle = false;
  const ended = gesture.whenIdle().then(() => (idle = true));
  gesture.wheel();
  gesture.release(1);
  await wait(0);
  assert.equal(idle, false, "the wheel burst goes on after the drag");
  await ended;
  assert.equal(gesture.active, false);
  assert.deepEqual(
    seen,
    [true, false],
    "listeners hear the begin and the end once",
  );
  gesture.press(2);
  gesture.move(2);
  gesture.cancel();
  assert.equal(gesture.active, false);
  await gesture.whenIdle();
});

test("the loop guard stops a cycle of view-derived domains and input resumes it", () => {
  let time = 0,
    shown = null;
  const guard = createLoopGuard({
    limit: 3,
    quiet: 100,
    now: () => time,
    report: (error) => (shown = error),
  });
  assert.equal(
    guard.allow(),
    true,
    "a view change with no view-derived domain is not counted",
  );
  const round = () => {
    guard.derived("Calculate", "Points", ["x"]);
    time += 10;
    return guard.allow();
  };
  assert.equal(round(), true);
  assert.equal(round(), true);
  assert.equal(round(), false);
  assert.equal(guard.stopped, true);
  assert.equal(shown.code, "view.cycle");
  assert.match(
    shown.message,
    /^Calculate reads the view .* the Points \(x\) drawing its output sets the axes' domains, which move the view: a cycle, stopped after 3 rounds without input\. Give the Plot's x axis a domain/,
  );
  assert.equal(guard.allow(), false, "stopped readers stay stopped");
  guard.input();
  assert.equal(shown, null, "input withdraws the error");
  assert.equal(round(), true);
  assert.equal(round(), true);
  time += 500;
  assert.equal(round(), true, "rounds apart by more than `quiet` start over");
  assert.equal(round(), true);
});
