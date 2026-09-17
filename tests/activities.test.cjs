const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../activities.js");
test("recommended entries have official sources and archived prototypes stay hidden", () => {
  const list = A.items.filter((a) => A.available(a, "2026-09-19"));
  assert.ok(list.length >= 5);
  assert.ok(
    list.every((a) => a.source?.url.startsWith("https://") && a.checkedAt),
  );
  for (const id of ["art", "music", "book"])
    assert.equal(
      A.available(
        A.items.find((a) => a.id === id),
        "2026-09-19",
      ),
      false,
    );
});
test("dated activity stays available through its last day and then expires", () => {
  const event = A.items.find((a) => a.id === "culture-2026");
  assert.equal(A.available(event, "2026-09-18"), false);
  assert.equal(A.available(event, "2026-09-19"), true);
  assert.equal(A.available(event, "2026-10-30"), true);
  assert.equal(A.available(event, "2026-10-31"), false);
});
test("archived IDs remain available for old personal plans, never silently remapped", () => {
  assert.match(A.items.find((a) => a.id === "music").place, /示例/);
  assert.match(A.items.find((a) => a.id === "book").place, /示例/);
  assert.equal(new Set(A.items.map((a) => a.id)).size, A.items.length);
});
