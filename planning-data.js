(function (root) {
  const point = (lat, lon, way) => ({
    coords: { lat, lon },
    locationSource: `https://www.openstreetmap.org/way/${way}`,
  });
  root.WeekendPlanningData = {
    lake: {
      ...point(30.5509845, 114.4124258, 236231355),
      windows: [{ open: "08:00", close: "18:00" }],
      preferred: [{ start: "14:00", end: "17:00" }],
      hoursKind: "suggested",
      hoursNote:
        "08:00–18:00 为产品建议的白天游玩范围，并非官方营业时间；出发前核实入口开放。",
    },
    market: {
      ...point(30.5537456, 114.3080425, 105570368),
      windows: [{ open: "10:00", close: "20:00" }],
      preferred: [{ start: "13:30", end: "16:30" }],
      hoursKind: "suggested",
      hoursNote:
        "10:00–20:00 为街区漫游建议范围，并非店铺营业时间；具体店铺另行核实。",
    },
    river: {
      ...point(30.588672, 114.2991252, 1525361096),
      windows: [{ open: "08:00", close: "21:00" }],
      preferred: [{ start: "16:30", end: "18:30" }],
      hoursKind: "suggested",
      hoursNote:
        "以汉口江滩一期附近为估算点；08:00–21:00 是建议安排范围，非官方开放保证。落日时刻随季节变化。",
    },
    "wuhan-museum-night": {
      ...point(30.6138079, 114.2509769, 369445342),
      windows: [{ open: "09:00", close: "20:30", lastEntry: "20:00" }],
      preferred: [{ start: "18:00", end: "20:00" }],
      hoursKind: "official",
      hoursNote:
        "2026/9/5–12/31 周六、周日 09:00–20:30，20:00 停止入馆；临时调整以官方公告为准。",
      hoursSource:
        "https://www.wuhan.gov.cn/hdjl/rdhy/202609/t20260905_2843817.shtml",
    },
    "optics-library": {
      ...point(30.492149, 114.4766821, 1173362395),
      windows: [],
      preferred: [{ start: "14:00", end: "17:00" }],
      hoursKind: "unknown",
      hoursNote: "尚未核实该日营业时间；预约后请填写已确认的开放时段。",
    },
    "culture-2026": {
      windows: [],
      hoursKind: "unknown",
      hoursNote: "文化季包含多个场次，需先确定具体活动、地点与时间。",
    },
  };
})(globalThis);
