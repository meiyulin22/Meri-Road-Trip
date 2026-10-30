import type { PlanDay, SamplePlan, Verification } from "./plan-view";

/**
 * Sample data for the plan page design (1.1000): five days, Lijiang then Dali, for a
 * traveller with their parents. Every number, time, price, forecast and source here is made up to
 * look like what the Planner will return; the page says so. Coordinates are the real
 * places', so the sketch map is laid out right. Sources have no links ("#").
 */

const checked = (zh: string, en: string, checkedAt: string): Verification =>
  ({ state: "verified", source: { zh, en }, url: "#", checkedAt });

const notFound = (zh: string, en: string): Verification => ({ state: "unverified", reason: { zh, en } });

const days: readonly PlanDay[] = [
  {
    day: 1,
    date: "2026-11-14",
    city: "丽江",
    cityEn: "Lijiang",
    title: { zh: "玉龙雪山和蓝月谷", en: "Jade Dragon Snow Mountain and Blue Moon Valley" },
    photo: { file: "jade-dragon-snow-mountain.jpg", artist: "we-o_rd35vacfthjzxteky" },
    weather: { morning: "sunny", afternoon: "cloudy", low: 3, high: 15, wind: 3, sunrise: "07:31",
      hours: [{ time: "08:00", sky: "sunny", temp: 4 }, { time: "11:00", sky: "sunny", temp: 11 }, { time: "14:00", sky: "cloudy", temp: 15 }, { time: "17:00", sky: "cloudy", temp: 10 }],
      reason: { zh: "上午晴、能见度好，先上雪山；午后云多起来，再去低处的白沙。", en: "Clear in the morning, so the snow mountain comes first; clouds build after noon, so lower Baisha follows." } },
    stops: [
      {
        id: "yulong",
        kind: "sight",
        name: "玉龙雪山",
        nameEn: "Jade Dragon Snow Mountain",
        time: "07:30",
        minutes: 180,
        point: [100.205, 27.103],
        hours: { text: { zh: "07:00–16:00，冰川公园索道 07:30 起", en: "07:00–16:00, glacier park cable car from 07:30" },
          verification: checked("玉龙雪山景区官方公众号", "Jade Dragon Snow Mountain official account", "11-13 10:20") },
        note: { zh: "索道要提前在官方小程序实名预约。山顶 4506 米，带父母建议只坐到冰川公园观景台，不爬台阶。",
          en: "Book the cable car in advance on the official mini program. The top is 4,506 m: with your parents, stop at the glacier park viewing deck and skip the stairs." },
      },
      {
        id: "lanyuegu",
        kind: "sight",
        name: "蓝月谷",
        nameEn: "Blue Moon Valley",
        time: "10:45",
        minutes: 80,
        point: [100.236, 27.122],
        hours: { text: { zh: "07:00–17:00", en: "07:00–17:00" },
          verification: checked("玉龙雪山景区官方公众号", "Jade Dragon Snow Mountain official account", "11-13 10:20") },
        note: { zh: "电瓶车绕一圈，平路为主，膝盖不吃力。", en: "Electric shuttle around the lakes, mostly flat: easy on the knees." },
      },
      {
        id: "baisha-lunch",
        kind: "meal",
        name: "白沙古镇 · 纳西家常菜",
        nameEn: "Naxi home cooking, Baisha",
        time: "12:45",
        minutes: 70,
        point: [100.214, 26.948],
        hours: { text: { zh: "营业时间没查到", en: "Opening hours not found" },
          verification: notFound("搜索结果里没有这家店的营业时间", "No source gave this restaurant's hours") },
        note: { zh: "不辣的纳西菜：腊排骨火锅、鸡豆凉粉。", en: "Mild Naxi dishes: cured rib hotpot, chickpea jelly." },
      },
      {
        id: "baisha",
        kind: "sight",
        name: "白沙古镇",
        nameEn: "Baisha Old Town",
        time: "14:00",
        minutes: 120,
        point: [100.216, 26.952],
        hours: { text: { zh: "全天开放，白沙壁画 08:30–17:30", en: "Open all day; Baisha murals 08:30–17:30" },
          verification: checked("丽江市文化和旅游局", "Lijiang Culture and Tourism Bureau", "11-13 10:22") },
      },
      {
        id: "old-town-stay",
        kind: "stay",
        name: "丽江古城",
        nameEn: "Lijiang Old Town",
        time: "17:20",
        minutes: 0,
        point: [100.233, 26.874],
      },
    ],
    legs: [
      { mode: "drive", minutes: 15, km: 6 },
      { mode: "drive", minutes: 40, km: 29 },
      { mode: "walk", minutes: 5, km: 0.3 },
      { mode: "drive", minutes: 25, km: 11 },
    ],
    feasibility: { roadMinutes: 85, endsAt: "17:45", sunset: "18:36" },
    unknowns: [
      { zh: "索道排队时间：当天看", en: "Cable car queue: check on the day" },
      { zh: "11 月是否限流：出发前一天再查一次", en: "Visitor caps in November: check again the day before" },
    ],
    stay: {
      area: { zh: "丽江古城南门附近，车能开到门口", en: "Near the old town's south gate, cars can reach the door" },
      hotels: [
        { name: "南门小院", price: 468, rating: 4.7 },
        { name: "雪山隐庐", price: 620, rating: 4.8 },
        { name: "纳西人家客栈", price: 280, rating: 4.4 },
      ],
    },
  },
  {
    day: 2,
    date: "2026-11-15",
    city: "丽江",
    cityEn: "Lijiang",
    title: { zh: "黑龙潭、束河和古城慢逛", en: "Black Dragon Pool, Shuhe and the old town" },
    photo: { file: "lijiang-old-town.jpg", artist: "Charlottees" },
    weather: { morning: "sunny", afternoon: "sunny", low: 4, high: 17, wind: 2, sunrise: "07:32",
      hours: [{ time: "08:00", sky: "sunny", temp: 5 }, { time: "11:00", sky: "sunny", temp: 13 }, { time: "14:00", sky: "sunny", temp: 17 }, { time: "17:00", sky: "sunny", temp: 12 }] },
    stops: [
      {
        id: "heilongtan", kind: "sight", name: "黑龙潭公园", nameEn: "Black Dragon Pool Park", time: "09:00", minutes: 90,
        point: [100.236, 26.886],
        hours: { text: { zh: "07:00–20:00", en: "07:00–20:00" }, verification: checked("丽江市文化和旅游局", "Lijiang Culture and Tourism Bureau", "11-13 10:24") },
        note: { zh: "早上拍玉龙雪山倒影最好。", en: "Best in the morning for the snow mountain's reflection." },
      },
      {
        id: "shuhe", kind: "sight", name: "束河古镇", nameEn: "Shuhe Old Town", time: "11:00", minutes: 150, point: [100.207, 26.921],
        hours: { text: { zh: "全天开放", en: "Open all day" }, verification: checked("丽江古城管理局", "Lijiang Old Town Administration", "11-13 10:25") },
        alternatives: ["束河古镇（丽江）", "束河村"],
      },
      {
        id: "mufu", kind: "sight", name: "木府", nameEn: "Mu Mansion", time: "15:00", minutes: 90, point: [100.236, 26.869],
        hours: { text: { zh: "08:30–17:30，17:00 停止入场", en: "08:30–17:30, last entry 17:00" }, verification: checked("木府官方公众号", "Mu Mansion official account", "11-13 10:26") },
      },
      { id: "old-town-2", kind: "stay", name: "丽江古城", nameEn: "Lijiang Old Town", time: "16:40", minutes: 0, point: [100.233, 26.874] },
    ],
    legs: [
      { mode: "drive", minutes: 15, km: 6 },
      { mode: "drive", minutes: 20, km: 8 },
      { mode: "walk", minutes: 10, km: 0.6 },
    ],
    feasibility: { roadMinutes: 45, endsAt: "16:40", sunset: "18:36" },
    unknowns: [],
    stay: {
      area: { zh: "继续住古城南门附近", en: "Same hotel near the south gate" },
      hotels: [{ name: "南门小院", price: 468, rating: 4.7 }],
    },
  },
  {
    day: 3,
    date: "2026-11-16",
    city: "大理",
    cityEn: "Dali",
    title: { zh: "去大理，下午在喜洲和洱海边", en: "To Dali: Xizhou and the Erhai shore" },
    photo: { file: "erhai-lake.jpg", artist: "4537668" },
    weather: { morning: "cloudy", afternoon: "sunny", low: 7, high: 19, wind: 3, sunrise: "07:33",
      hours: [{ time: "08:00", sky: "cloudy", temp: 8 }, { time: "11:00", sky: "cloudy", temp: 14 }, { time: "14:00", sky: "sunny", temp: 19 }, { time: "17:00", sky: "sunny", temp: 15 }] },
    stops: [
      { id: "leave-lijiang", kind: "stay", name: "丽江古城", nameEn: "Lijiang Old Town", time: "09:00", minutes: 0, point: [100.233, 26.874] },
      {
        id: "xizhou", kind: "sight", name: "喜洲古镇", nameEn: "Xizhou Old Town", time: "12:00", minutes: 150, point: [100.131, 25.852],
        hours: { text: { zh: "全天开放，严家大院 08:30–18:00", en: "Open all day; Yan family compound 08:30–18:00" }, verification: checked("大理州文化和旅游局", "Dali Prefecture Culture and Tourism Bureau", "11-13 10:28") },
        note: { zh: "午饭吃喜洲粑粑，咸甜都有，不辣。", en: "Lunch: Xizhou baba flatbread, sweet or savoury, not spicy." },
      },
      {
        id: "erhai-path", kind: "sight", name: "洱海生态廊道", nameEn: "Erhai eco-corridor", time: "15:00", minutes: 90, point: [100.158, 25.858],
        hours: { text: { zh: "全天开放", en: "Open all day" }, verification: notFound("没有找到官方的开放说明", "No official opening notice found") },
        note: { zh: "租电瓶车沿湖走一段，父母坐观光车。", en: "Rent an e-bike along the shore; your parents can take the sightseeing cart." },
      },
      { id: "dali-stay", kind: "stay", name: "大理古城", nameEn: "Dali Old Town", time: "17:30", minutes: 0, point: [100.163, 25.693] },
    ],
    legs: [
      { mode: "drive", minutes: 160, km: 182 },
      { mode: "drive", minutes: 10, km: 3 },
      { mode: "drive", minutes: 30, km: 21 },
    ],
    feasibility: { roadMinutes: 200, endsAt: "18:00", sunset: "18:38" },
    unknowns: [{ zh: "大丽高速周末车流：出发前看路况", en: "Weekend traffic on the Dali–Lijiang expressway: check before leaving" }],
    stay: {
      area: { zh: "大理古城人民路附近，离南门近", en: "Near Renmin Road in Dali Old Town, close to the south gate" },
      hotels: [
        { name: "苍洱小筑", price: 560, rating: 4.8 },
        { name: "人民路客栈", price: 320, rating: 4.6 },
      ],
    },
  },
  {
    day: 4,
    date: "2026-11-17",
    city: "大理",
    cityEn: "Dali",
    title: { zh: "苍山索道和崇圣寺三塔", en: "Cangshan by cable car and the Three Pagodas" },
    photo: { file: "cangshan-dali.jpg", artist: "pony96" },
    weather: { morning: "sunny", afternoon: "overcast", low: 8, high: 18, wind: 5, sunrise: "07:33",
      hours: [{ time: "08:00", sky: "sunny", temp: 9 }, { time: "11:00", sky: "sunny", temp: 15 }, { time: "14:00", sky: "overcast", temp: 18 }, { time: "17:00", sky: "rain", temp: 13 }],
      reason: { zh: "下午转阴、风大到 5 级，索道可能停运，所以苍山放上午、三塔放下午；带件外套。", en: "Overcast and windy (force 5) in the afternoon, when the cable car may stop: Cangshan goes in the morning, the pagodas after lunch. Bring a jacket." } },
    stops: [
      {
        id: "cangshan", kind: "sight", name: "苍山", nameEn: "Cangshan", time: "09:00", minutes: 180, point: [100.118, 25.662],
        hours: { text: { zh: "感通索道 08:30–17:00", en: "Gantong cable car 08:30–17:00" }, verification: checked("苍山景区官方网站", "Cangshan official website", "11-13 10:30") },
        note: { zh: "坐感通索道上下，玉带路平缓，走一小段就回。", en: "Gantong cable car both ways; the Jade Belt path is flat, walk a short stretch and return." },
        alternatives: ["苍山（大理）", "苍山县（山东临沂，旧名）"],
      },
      {
        id: "santa", kind: "sight", name: "崇圣寺三塔", nameEn: "Three Pagodas of Chongsheng Temple", time: "14:00", minutes: 120, point: [100.149, 25.712],
        hours: { text: { zh: "07:00–19:00", en: "07:00–19:00" }, verification: checked("崇圣寺三塔文化旅游区官网", "Three Pagodas official website", "11-13 10:31") },
      },
      { id: "dali-stay-2", kind: "stay", name: "大理古城", nameEn: "Dali Old Town", time: "16:30", minutes: 0, point: [100.163, 25.693] },
    ],
    legs: [
      { mode: "drive", minutes: 35, km: 14 },
      { mode: "drive", minutes: 15, km: 5 },
    ],
    feasibility: { roadMinutes: 50, endsAt: "16:30", sunset: "18:38" },
    unknowns: [],
    stay: { area: { zh: "继续住大理古城", en: "Same hotel in Dali Old Town" }, hotels: [{ name: "苍洱小筑", price: 560, rating: 4.8 }] },
  },
  {
    day: 5,
    date: "2026-11-18",
    city: "大理",
    cityEn: "Dali",
    title: { zh: "双廊看洱海，下午回上海", en: "Erhai at Shuanglang, then home" },
    photo: { file: "erhai-lake.jpg", artist: "4537668" },
    weather: { morning: "sunny", afternoon: "sunny", low: 8, high: 20, wind: 2, sunrise: "07:34",
      hours: [{ time: "08:00", sky: "sunny", temp: 9 }, { time: "11:00", sky: "sunny", temp: 16 }, { time: "14:00", sky: "sunny", temp: 20 }, { time: "17:00", sky: "sunny", temp: 15 }] },
    stops: [
      {
        id: "shuanglang", kind: "sight", name: "双廊古镇", nameEn: "Shuanglang Old Town", time: "09:30", minutes: 150, point: [100.203, 25.915],
        hours: { text: { zh: "全天开放", en: "Open all day" }, verification: checked("大理州文化和旅游局", "Dali Prefecture Culture and Tourism Bureau", "11-13 10:33") },
      },
      { id: "airport", kind: "stay", name: "大理凤仪机场", nameEn: "Dali Fengyi Airport", time: "15:40", minutes: 0, point: [100.319, 25.649] },
    ],
    legs: [{ mode: "drive", minutes: 75, km: 48 }],
    feasibility: { roadMinutes: 75, endsAt: "15:40", sunset: "18:38" },
    unknowns: [],
    stay: { area: { zh: "当晚回家", en: "Home that night" }, hotels: [] },
  },
];

export const samplePlan: SamplePlan = {
  asOf: "2026-10-30",
  province: "云南",
  cities: [{ name: "丽江", nameEn: "Lijiang" }, { name: "大理", nameEn: "Dali" }],
  days,
  origin: "上海",
  startDate: "2026-11-14",
  outbound: [
    { mode: "flight", number: "MU5803", from: "上海浦东", to: "丽江三义", date: "2026-11-13", depart: "19:05", arrive: "22:45",
      price: 860, provider: "RollingGo", checkedAt: "10:20", recommended: true },
    { mode: "flight", number: "CA4521", from: "上海虹桥", to: "丽江三义", date: "2026-11-13", depart: "15:30", arrive: "19:20",
      price: 1040, provider: "RollingGo", checkedAt: "10:20" },
    { mode: "train", number: "D3786 + D8762", from: "上海虹桥", to: "丽江", date: "2026-11-13", depart: "06:12", arrive: "20:41",
      price: 1320, provider: "途牛", checkedAt: "10:21" },
  ],
  homebound: [
    { mode: "flight", number: "MU5980", from: "大理凤仪", to: "上海浦东", date: "2026-11-18", depart: "17:40", arrive: "21:10",
      price: 790, provider: "RollingGo", checkedAt: "10:20", recommended: true },
  ],
  memories: [
    { id: "parents", label: { zh: "带父母出行", en: "Travelling with parents" }, from: { quote: "这次带我爸妈一起去" } },
    { id: "knee", label: { zh: "爸爸膝盖不好，少爬台阶", en: "Dad's knee: few stairs" }, from: { quote: "我爸膝盖不太好，别安排爬山" } },
    { id: "spicy", label: { zh: "不吃辣", en: "No spicy food" }, from: { quote: "我们都不吃辣" } },
  ],
  run: { seconds: 38, toolCalls: 41, costYuan: 0.21 },
};
