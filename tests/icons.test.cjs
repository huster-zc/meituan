const test = require("node:test");
const assert = require("node:assert/strict");
const { icon, weatherIcon } = require("../icons.js");

test("weather codes preserve distinct conditions including snow and fog", () => {
  for (const [code, expected] of [
    [0, "sun"],
    [1, "cloud-sun"],
    [2, "cloud-sun"],
    [3, "cloud"],
    [45, "fog"],
    [48, "fog"],
    [51, "rain"],
    [67, "rain"],
    [82, "rain"],
    [71, "snow"],
    [77, "snow"],
    [86, "snow"],
    [95, "storm"],
    [99, "storm"],
  ]) {
    assert.equal(weatherIcon(code), expected);
    assert.ok(!icon(weatherIcon(code)).includes("icon-unknown"));
  }
  for (const code of [undefined, null, -1, 10, 100, "0"])
    assert.equal(weatherIcon(code), "unknown");
});

test("icon names cannot inject markup, and decorative icons cannot steal focus", () => {
  const svg = icon('\"><script>alert(1)</script>');
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /focusable="false"/);
  assert.match(svg, /icon-unknown/);
});
