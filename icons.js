(function (root) {
  "use strict";
  const paths = {
    "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
    "arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    "arrow-up": '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    "arrow-down": '<path d="M12 4v16m-6-6 6 6 6-6"/>',
    external:
      '<path d="M14 4h6v6m0-6L10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    heart:
      '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
    "heart-filled":
      '<path fill="currentColor" d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    sparkles:
      '<path d="m10 3 2.5 6.5L19 12l-6.5 2.5L10 21l-2.5-6.5L1 12l6.5-2.5L10 3ZM20 2v4m-2-2h4"/>',
    compass:
      '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
    turn: '<path d="M5 4v7a3 3 0 0 0 3 3h12m-5-5 5 5-5 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    cloud:
      '<path d="M6 19a4.5 4.5 0 0 1-.5-9A6.5 6.5 0 0 1 18 8a5.5 5.5 0 0 1 0 11H6Z"/>',
    "cloud-sun":
      '<path d="M6 3v2M2 7l1 1m7-5-1 2M2 12h2"/><path d="M5 10a4 4 0 1 1 7-3"/><path d="M8 20a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 18 11a4.5 4.5 0 0 1 0 9H8Z"/>',
    fog: '<path d="M5 11a4 4 0 0 1 1-7 6 6 0 0 1 11 2 4 4 0 0 1 3 5M3 15h18M5 19h14"/>',
    rain: '<path d="M5 14a4 4 0 0 1 1-8 6 6 0 0 1 11 2 4 4 0 0 1 3 6M8 17l-1 3m6-3-1 3m6-3-1 3"/>',
    snow: '<path d="M5 13a4 4 0 0 1 1-8 6 6 0 0 1 11 2 4 4 0 0 1 3 6M8 16v5m-2-4 4 3m0-3-4 3m12-4v5m-2-4 4 3m0-3-4 3"/>',
    storm:
      '<path d="M5 14a4 4 0 0 1 1-8 6 6 0 0 1 11 2 4 4 0 0 1 3 6m-8-2-3 5h5l-3 5"/>',
    unknown:
      '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
  };
  function icon(name) {
    const key = Object.hasOwn(paths, name) ? name : "unknown";
    return `<svg class="icon icon-${key}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
  }
  function weatherIcon(code) {
    if (code === 0) return "sun";
    if (code === 1 || code === 2) return "cloud-sun";
    if (code === 3) return "cloud";
    if ([45, 48].includes(code)) return "fog";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
      return "rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ([95, 96, 99].includes(code)) return "storm";
    return "unknown";
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { icon, weatherIcon };
  else {
    root.icon = icon;
    root.weatherIcon = weatherIcon;
    // Render only explicit placeholders, never user text. Covers dynamic views and dialogs.
    function hydrate() {
      document.querySelectorAll("[data-icon]").forEach((el) => {
        el.outerHTML = icon(el.getAttribute("data-icon"));
      });
    }
    hydrate();
    new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes].some(
            (node) =>
              node.nodeType === 1 &&
              (node.matches("[data-icon]") ||
                node.querySelector("[data-icon]")),
          ),
        )
      )
        hydrate();
    }).observe(document.body, { childList: true, subtree: true });
  }
})(globalThis);
