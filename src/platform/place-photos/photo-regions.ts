/**
 * The English words a photo library's uploader writes for Chinese regions, so a photo's
 * tags can be read as evidence of where it was taken. Pixabay has no location field:
 * these words are the only regional evidence there is, and they only ever rule a photo
 * out — a tag naming Lijiang does not prove a photo is in Lijiang, but it does make it a
 * poor photo of Dali.
 *
 * Every province-level region is listed. Prefectures are the ones travellers name and
 * photograph most; one missing from the list simply cannot conflict with anything.
 */
export interface RegionWords {
  /** The full Chinese name, as Meri stores it: 云南省, 大理白族自治州. */
  readonly name: string;
  /** Lower-case English words; a phrase is written with single spaces. */
  readonly words: readonly string[];
}

export const provinceWords: readonly RegionWords[] = [
  { name: "北京市", words: ["beijing", "peking"] },
  { name: "天津市", words: ["tianjin"] },
  { name: "河北省", words: ["hebei"] },
  { name: "山西省", words: ["shanxi"] },
  { name: "内蒙古自治区", words: ["inner mongolia", "neimenggu"] },
  { name: "辽宁省", words: ["liaoning"] },
  { name: "吉林省", words: ["jilin"] },
  { name: "黑龙江省", words: ["heilongjiang"] },
  { name: "上海市", words: ["shanghai"] },
  { name: "江苏省", words: ["jiangsu"] },
  { name: "浙江省", words: ["zhejiang"] },
  { name: "安徽省", words: ["anhui"] },
  { name: "福建省", words: ["fujian"] },
  { name: "江西省", words: ["jiangxi"] },
  { name: "山东省", words: ["shandong"] },
  { name: "河南省", words: ["henan"] },
  { name: "湖北省", words: ["hubei"] },
  { name: "湖南省", words: ["hunan"] },
  { name: "广东省", words: ["guangdong", "canton"] },
  { name: "广西壮族自治区", words: ["guangxi"] },
  { name: "海南省", words: ["hainan"] },
  { name: "重庆市", words: ["chongqing"] },
  { name: "四川省", words: ["sichuan", "szechuan"] },
  { name: "贵州省", words: ["guizhou"] },
  { name: "云南省", words: ["yunnan"] },
  { name: "西藏自治区", words: ["tibet", "tibetan", "xizang"] },
  { name: "陕西省", words: ["shaanxi"] },
  { name: "甘肃省", words: ["gansu"] },
  { name: "青海省", words: ["qinghai"] },
  { name: "宁夏回族自治区", words: ["ningxia"] },
  { name: "新疆维吾尔自治区", words: ["xinjiang"] },
  { name: "台湾省", words: ["taiwan", "taipei"] },
  { name: "香港特别行政区", words: ["hong kong", "hongkong"] },
  { name: "澳门特别行政区", words: ["macau", "macao"] },
];

export const prefectureWords: readonly (RegionWords & { readonly province: string })[] = [
  // 云南
  { province: "云南省", name: "昆明市", words: ["kunming"] },
  { province: "云南省", name: "大理白族自治州", words: ["dali"] },
  { province: "云南省", name: "丽江市", words: ["lijiang"] },
  { province: "云南省", name: "迪庆藏族自治州", words: ["shangri la", "shangrila", "diqing", "deqin", "zhongdian"] },
  { province: "云南省", name: "西双版纳傣族自治州", words: ["xishuangbanna", "jinghong"] },
  { province: "云南省", name: "红河哈尼族彝族自治州", words: ["honghe", "yuanyang", "jianshui"] },
  { province: "云南省", name: "怒江傈僳族自治州", words: ["nujiang"] },
  { province: "云南省", name: "保山市", words: ["baoshan", "tengchong"] },
  { province: "云南省", name: "普洱市", words: ["puer", "pu er"] },
  { province: "云南省", name: "德宏傣族景颇族自治州", words: ["dehong", "ruili"] },
  { province: "云南省", name: "楚雄彝族自治州", words: ["chuxiong"] },
  { province: "云南省", name: "文山壮族苗族自治州", words: ["wenshan"] },
  { province: "云南省", name: "玉溪市", words: ["yuxi"] },
  { province: "云南省", name: "曲靖市", words: ["qujing"] },
  // 四川
  { province: "四川省", name: "成都市", words: ["chengdu"] },
  { province: "四川省", name: "阿坝藏族羌族自治州", words: ["aba", "ngawa", "jiuzhaigou", "huanglong", "songpan"] },
  { province: "四川省", name: "甘孜藏族自治州", words: ["garze", "ganzi", "kangding", "daocheng", "yading", "litang", "seda", "larung"] },
  { province: "四川省", name: "乐山市", words: ["leshan"] },
  { province: "四川省", name: "凉山彝族自治州", words: ["liangshan", "xichang"] },
  { province: "四川省", name: "雅安市", words: ["yaan", "ya an"] },
  // 西藏
  { province: "西藏自治区", name: "拉萨市", words: ["lhasa"] },
  { province: "西藏自治区", name: "日喀则市", words: ["shigatse", "xigaze", "rikaze"] },
  { province: "西藏自治区", name: "林芝市", words: ["nyingchi", "linzhi"] },
  { province: "西藏自治区", name: "山南市", words: ["shannan", "lhoka"] },
  { province: "西藏自治区", name: "阿里地区", words: ["ngari"] },
  { province: "西藏自治区", name: "那曲市", words: ["nagqu", "nakchu"] },
  // 青海、甘肃、宁夏、新疆
  { province: "青海省", name: "西宁市", words: ["xining"] },
  { province: "青海省", name: "海西蒙古族藏族自治州", words: ["haixi", "golmud", "chaka"] },
  { province: "青海省", name: "玉树藏族自治州", words: ["yushu"] },
  { province: "甘肃省", name: "兰州市", words: ["lanzhou"] },
  { province: "甘肃省", name: "酒泉市", words: ["jiuquan", "dunhuang"] },
  { province: "甘肃省", name: "嘉峪关市", words: ["jiayuguan"] },
  { province: "甘肃省", name: "张掖市", words: ["zhangye"] },
  { province: "甘肃省", name: "甘南藏族自治州", words: ["gannan", "xiahe", "labrang"] },
  { province: "甘肃省", name: "天水市", words: ["tianshui"] },
  { province: "宁夏回族自治区", name: "银川市", words: ["yinchuan"] },
  { province: "宁夏回族自治区", name: "中卫市", words: ["zhongwei"] },
  { province: "新疆维吾尔自治区", name: "乌鲁木齐市", words: ["urumqi"] },
  { province: "新疆维吾尔自治区", name: "阿勒泰地区", words: ["altay", "kanas"] },
  { province: "新疆维吾尔自治区", name: "伊犁哈萨克自治州", words: ["ili", "yili"] },
  { province: "新疆维吾尔自治区", name: "喀什地区", words: ["kashgar", "kashi"] },
  { province: "新疆维吾尔自治区", name: "吐鲁番市", words: ["turpan", "turfan"] },
  { province: "新疆维吾尔自治区", name: "昌吉回族自治州", words: ["changji"] },
  // 内蒙古
  { province: "内蒙古自治区", name: "呼和浩特市", words: ["hohhot"] },
  { province: "内蒙古自治区", name: "呼伦贝尔市", words: ["hulunbuir", "hulunbeier"] },
  { province: "内蒙古自治区", name: "鄂尔多斯市", words: ["ordos"] },
  { province: "内蒙古自治区", name: "阿拉善盟", words: ["alxa", "alashan"] },
  { province: "内蒙古自治区", name: "锡林郭勒盟", words: ["xilingol", "xilinhot"] },
  // 华北、东北
  { province: "河北省", name: "石家庄市", words: ["shijiazhuang"] },
  { province: "河北省", name: "承德市", words: ["chengde"] },
  { province: "河北省", name: "秦皇岛市", words: ["qinhuangdao", "beidaihe"] },
  { province: "山西省", name: "太原市", words: ["taiyuan"] },
  { province: "山西省", name: "大同市", words: ["datong"] },
  { province: "山西省", name: "晋中市", words: ["jinzhong", "pingyao"] },
  { province: "山西省", name: "忻州市", words: ["xinzhou", "wutai", "wutaishan"] },
  { province: "辽宁省", name: "沈阳市", words: ["shenyang"] },
  { province: "辽宁省", name: "大连市", words: ["dalian"] },
  { province: "吉林省", name: "长春市", words: ["changchun"] },
  { province: "吉林省", name: "延边朝鲜族自治州", words: ["yanbian", "yanji"] },
  { province: "黑龙江省", name: "哈尔滨市", words: ["harbin"] },
  // 华东
  { province: "江苏省", name: "南京市", words: ["nanjing"] },
  { province: "江苏省", name: "苏州市", words: ["suzhou"] },
  { province: "江苏省", name: "无锡市", words: ["wuxi"] },
  { province: "江苏省", name: "扬州市", words: ["yangzhou"] },
  { province: "浙江省", name: "杭州市", words: ["hangzhou"] },
  { province: "浙江省", name: "宁波市", words: ["ningbo"] },
  { province: "浙江省", name: "绍兴市", words: ["shaoxing"] },
  { province: "浙江省", name: "嘉兴市", words: ["jiaxing", "wuzhen"] },
  { province: "浙江省", name: "舟山市", words: ["zhoushan", "putuo"] },
  { province: "安徽省", name: "合肥市", words: ["hefei"] },
  { province: "安徽省", name: "黄山市", words: ["huangshan", "hongcun", "xidi"] },
  { province: "安徽省", name: "池州市", words: ["chizhou", "jiuhua", "jiuhuashan"] },
  { province: "福建省", name: "福州市", words: ["fuzhou"] },
  { province: "福建省", name: "厦门市", words: ["xiamen", "amoy", "gulangyu"] },
  { province: "福建省", name: "南平市", words: ["nanping", "wuyishan"] },
  { province: "福建省", name: "泉州市", words: ["quanzhou"] },
  { province: "江西省", name: "南昌市", words: ["nanchang"] },
  { province: "江西省", name: "上饶市", words: ["shangrao", "wuyuan", "sanqingshan"] },
  { province: "江西省", name: "九江市", words: ["jiujiang", "lushan"] },
  { province: "江西省", name: "景德镇市", words: ["jingdezhen"] },
  { province: "山东省", name: "济南市", words: ["jinan"] },
  { province: "山东省", name: "青岛市", words: ["qingdao", "tsingtao"] },
  { province: "山东省", name: "泰安市", words: ["taian", "tai an"] },
  { province: "山东省", name: "烟台市", words: ["yantai", "penglai"] },
  // 华中、华南、西南
  { province: "河南省", name: "郑州市", words: ["zhengzhou", "shaolin"] },
  { province: "河南省", name: "洛阳市", words: ["luoyang", "longmen"] },
  { province: "河南省", name: "开封市", words: ["kaifeng"] },
  { province: "湖北省", name: "武汉市", words: ["wuhan"] },
  { province: "湖北省", name: "宜昌市", words: ["yichang"] },
  { province: "湖北省", name: "恩施土家族苗族自治州", words: ["enshi"] },
  { province: "湖北省", name: "神农架林区", words: ["shennongjia"] },
  { province: "湖南省", name: "长沙市", words: ["changsha"] },
  { province: "湖南省", name: "张家界市", words: ["zhangjiajie", "wulingyuan", "tianmen"] },
  { province: "湖南省", name: "湘西土家族苗族自治州", words: ["xiangxi", "fenghuang"] },
  { province: "广东省", name: "广州市", words: ["guangzhou"] },
  { province: "广东省", name: "深圳市", words: ["shenzhen"] },
  { province: "广东省", name: "珠海市", words: ["zhuhai"] },
  { province: "广东省", name: "潮州市", words: ["chaozhou"] },
  { province: "广西壮族自治区", name: "桂林市", words: ["guilin", "yangshuo", "longji", "li river"] },
  { province: "广西壮族自治区", name: "南宁市", words: ["nanning"] },
  { province: "广西壮族自治区", name: "北海市", words: ["beihai", "weizhou"] },
  { province: "海南省", name: "海口市", words: ["haikou"] },
  { province: "海南省", name: "三亚市", words: ["sanya"] },
  { province: "贵州省", name: "贵阳市", words: ["guiyang"] },
  { province: "贵州省", name: "安顺市", words: ["anshun", "huangguoshu"] },
  { province: "贵州省", name: "黔东南苗族侗族自治州", words: ["qiandongnan", "kaili", "xijiang", "zhaoxing"] },
  { province: "陕西省", name: "西安市", words: ["xian", "xi an"] },
  { province: "陕西省", name: "延安市", words: ["yanan", "yan an"] },
  { province: "陕西省", name: "渭南市", words: ["weinan", "huashan"] },
];

/**
 * Places outside China a landmark photo is often confused with: a Mount Fuji under the
 * word "mount", Swiss lakes under "lake", Meteora's rocks under "stone". Mongolia is absent on purpose — Inner Mongolia
 * is in China and its photos are tagged with the word.
 */
export const foreignWords: readonly string[] = [
  "japan", "japanese", "fuji", "kyoto", "tokyo", "korea", "korean", "seoul", "nepal", "kathmandu",
  "india", "indian", "bhutan", "pakistan", "vietnam", "thailand", "thai", "laos", "myanmar", "burma", "cambodia",
  "switzerland", "swiss", "alps", "italy", "italian", "france", "french", "norway", "iceland", "canada", "usa",
  "america", "american", "peru", "patagonia", "new zealand", "austria", "scotland", "germany", "england", "russia",
  "kyrgyzstan", "kazakhstan", "turkey", "indonesia", "bali", "philippines", "malaysia", "singapore",
  "greece", "greek", "meteora", "spain", "portugal", "croatia", "slovenia", "mexico", "brazil", "argentina", "chile",
  "australia", "georgia", "armenia", "iran", "jordan", "egypt", "morocco", "uzbekistan", "tajikistan",
];

/** The same lookalike places in Chinese, for tags Pixabay returns when asked with lang=zh. */
export const foreignWordsZh: readonly string[] = [
  "日本", "富士", "京都", "东京", "韩国", "首尔", "尼泊尔", "加德满都", "印度", "不丹", "巴基斯坦", "越南", "泰国", "曼谷",
  "老挝", "缅甸", "柬埔寨", "东南亚", "瑞士", "阿尔卑斯", "意大利", "法国", "挪威", "冰岛", "加拿大", "美国", "秘鲁",
  "新西兰", "奥地利", "苏格兰", "德国", "英国", "俄罗斯", "土耳其", "印尼", "巴厘", "菲律宾", "马来西亚", "新加坡",
  "希腊", "西班牙", "葡萄牙", "墨西哥", "巴西", "澳大利亚", "埃及", "摩洛哥",
];

const ethnicGroups = /(?:白|藏|羌|傣|哈尼|彝|傈僳|景颇|壮|苗|侗|土家|朝鲜|蒙古|哈萨克|回|布依|黎|柯尔克孜|纳西|瑶|畲|满|土|撒拉)族/gu;

/**
 * The short Chinese name a region goes by in tags and speech: 大理白族自治州 → 大理,
 * 红河哈尼族彝族自治州 → 红河, 新疆维吾尔自治区 → 新疆, 丽江市 → 丽江.
 */
export function regionShortName(name: string): string {
  return name.normalize("NFKC").trim()
    .replace(ethnicGroups, "")
    .replace(/(?:维吾尔)?(?:自治州|自治区|自治县|特别行政区|地区|林区|盟|省|市|州|县|区)$/u, "");
}
