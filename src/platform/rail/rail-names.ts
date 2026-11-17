/**
 * 12306 knows a city by its short name: 丽江, 大理, 上海, not 丽江市 or 大理白族自治州 (probe
 * 2026-11-17: 大理白族自治州 → 未检索到城市). These turn Meri's administrative names, and a
 * picked origin's region, into that short name. Whether 12306 knows it is still checked
 * against its own station table; a name it does not know is "no station", never a guess.
 */

// A 自治州 or 自治县 name carries its peoples between the place and the ending: 大理白族自治州,
// 西双版纳傣族自治州. The peoples are named, longest first, so the place keeps all its characters.
const peoples = ["柯尔克孜", "乌孜别克", "维吾尔", "哈萨克", "鄂温克", "鄂伦春", "达斡尔", "塔吉克", "塔塔尔", "俄罗斯",
  "景颇", "哈尼", "布依", "土家", "蒙古", "朝鲜", "傈僳", "纳西", "拉祜", "裕固", "东乡", "保安", "仫佬", "毛南", "仡佬",
  "独龙", "普米", "阿昌", "德昂", "布朗", "基诺", "门巴", "珞巴", "锡伯", "赫哲", "撒拉",
  "白", "藏", "傣", "彝", "壮", "苗", "侗", "羌", "回", "佤", "瑶", "黎", "畲", "土", "满", "水", "京", "怒"];
const autonomous = new RegExp(`^(.+?)(?:(?:${peoples.join("|")})族)+自治(?:州|县|旗)$`, "u");
const plainSuffix = /^(.+?)(?:特别行政区|地区|市|州|盟|县|区|旗)$/u;

/** 大理白族自治州 → 大理, 丽江市 → 丽江, 上海市 → 上海; a name without an ending stays as it is. */
export function railCityName(adminName: string): string {
  const name = adminName.normalize("NFKC").trim();
  const people = autonomous.exec(name);
  if (people) return people[1];
  const plain = plainSuffix.exec(name);
  // A two-character name such as 沙市 keeps its ending: one character is no city.
  return plain && plain[1].length >= 2 ? plain[1] : name;
}

/** Provinces and the four municipalities, as written at the start of a Tianditu region. */
const provinceStart = /^(?:北京市|天津市|上海市|重庆市|.{2,3}?(?:省|自治区|特别行政区)|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区)/u;
const cityPart = /^(.+?(?:自治州|地区|盟|市))/u;

/**
 * The city of a picked origin, from the region Tianditu gave with the suggestion: 上海市闵行区 →
 * 上海, 云南省丽江市古城区 → 丽江. Without a region, the place's own name.
 */
export function railCityOfRegion(region: string | null, name: string): string {
  if (!region) return railCityName(name);
  const province = provinceStart.exec(region)?.[0] ?? "";
  // The municipalities are their own city.
  if (/^(?:北京|天津|上海|重庆)市$/u.test(province)) return province.slice(0, 2);
  const rest = region.slice(province.length);
  const city = cityPart.exec(rest)?.[1];
  return city ? railCityName(city) : railCityName(name);
}
