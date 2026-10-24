/**
 * 图集要覆盖的城市：每个地级行政区一张代表图。按批次登记，每批人工审核后才进图集。
 * scripts/build-city-catalog.ts 读这份清单去 Pixabay 找候选。
 *
 * 每个城市写 1–2 个最常被拍、最能代表它的景点，中英文名各一份；照片的说明文字是
 * 实际拍到的景点，不是城市名。已经在图集里有代表图的城市（scenicFor）跳过。
 */
export interface CatalogLandmark {
  /** 中文常用名，也是图集条目的名字和照片说明。 */
  readonly zh: string;
  /** 英文常用名，lang=en 搜索用。 */
  readonly en: string;
}

export interface CatalogCity {
  readonly province: string;
  /** 全称，和 Meri 保存的写法一致：苏州市、大理白族自治州。 */
  readonly name: string;
  /** 简称：苏州、大理。图集的 regions / scenicFor 两种写法都登记。 */
  readonly short: string;
  /** 城市的英文写法，搜城市景色时用；同音的城市带上省份（Taizhou Jiangsu）。 */
  readonly en?: string;
  readonly landmarks: readonly CatalogLandmark[];
}

export interface CatalogBatch {
  readonly id: string;
  readonly cities: readonly CatalogCity[];
}

const jiangsu: readonly CatalogCity[] = [
  { province: "江苏省", name: "南京市", short: "南京", landmarks: [
    { zh: "中山陵", en: "Sun Yat-sen Mausoleum" }, { zh: "玄武湖", en: "Xuanwu Lake" }] },
  { province: "江苏省", name: "无锡市", short: "无锡", landmarks: [
    { zh: "鼋头渚", en: "Yuantouzhu" }, { zh: "灵山大佛", en: "Lingshan Grand Buddha" }] },
  { province: "江苏省", name: "徐州市", short: "徐州", landmarks: [
    { zh: "云龙湖", en: "Yunlong Lake" }, { zh: "龟山汉墓", en: "Guishan Han Tombs" }] },
  { province: "江苏省", name: "常州市", short: "常州", landmarks: [
    { zh: "天目湖", en: "Tianmu Lake" }, { zh: "天宁寺", en: "Tianning Temple" }] },
  { province: "江苏省", name: "苏州市", short: "苏州", en: "Suzhou", landmarks: [
    { zh: "拙政园", en: "Humble Administrator's Garden" }, { zh: "周庄", en: "Zhouzhuang" }] },
  { province: "江苏省", name: "南通市", short: "南通", landmarks: [
    { zh: "狼山", en: "Langshan" }, { zh: "濠河", en: "Hao River" }] },
  { province: "江苏省", name: "连云港市", short: "连云港", en: "Lianyungang", landmarks: [
    { zh: "花果山", en: "Huaguo Mountain" }] },
  { province: "江苏省", name: "淮安市", short: "淮安", en: "Huai'an", landmarks: [
    { zh: "河下古镇", en: "Hexia Ancient Town" }, { zh: "周恩来纪念馆", en: "Zhou Enlai Memorial" }] },
  { province: "江苏省", name: "盐城市", short: "盐城", landmarks: [
    { zh: "盐城湿地", en: "Yancheng Wetland" }, { zh: "丹顶鹤", en: "Red-crowned Crane Yancheng" }] },
  { province: "江苏省", name: "扬州市", short: "扬州", landmarks: [
    { zh: "瘦西湖", en: "Slender West Lake" }, { zh: "个园", en: "Ge Garden" }] },
  { province: "江苏省", name: "镇江市", short: "镇江", en: "Zhenjiang", landmarks: [
    { zh: "金山寺", en: "Jinshan Temple" }, { zh: "西津渡", en: "Xijindu" }] },
  { province: "江苏省", name: "泰州市", short: "泰州", en: "Taizhou Jiangsu", landmarks: [
    { zh: "千垛菜花", en: "Qianduo Rapeseed Flowers" }, { zh: "溱湖", en: "Qinhu Lake" }] },
  { province: "江苏省", name: "宿迁市", short: "宿迁", en: "Suqian", landmarks: [
    { zh: "项王故里", en: "Xiang Yu Hometown" }, { zh: "洪泽湖湿地", en: "Hongze Lake Wetland" }] },
];

const zhejiang: readonly CatalogCity[] = [
  // 杭州市已有西湖代表图，不在这一批。
  { province: "浙江省", name: "宁波市", short: "宁波", landmarks: [
    { zh: "天一阁", en: "Tianyi Pavilion" }, { zh: "东钱湖", en: "Dongqian Lake" }] },
  { province: "浙江省", name: "温州市", short: "温州", landmarks: [
    { zh: "雁荡山", en: "Yandang Mountain" }, { zh: "楠溪江", en: "Nanxi River" }] },
  { province: "浙江省", name: "嘉兴市", short: "嘉兴", landmarks: [
    { zh: "乌镇", en: "Wuzhen" }, { zh: "西塘", en: "Xitang" }] },
  { province: "浙江省", name: "湖州市", short: "湖州", landmarks: [
    { zh: "南浔古镇", en: "Nanxun Ancient Town" }, { zh: "莫干山", en: "Moganshan" }] },
  { province: "浙江省", name: "绍兴市", short: "绍兴", en: "Shaoxing", landmarks: [
    { zh: "鲁迅故里", en: "Lu Xun Native Place" }, { zh: "东湖", en: "Shaoxing East Lake" }] },
  { province: "浙江省", name: "金华市", short: "金华", landmarks: [
    { zh: "横店影视城", en: "Hengdian World Studios" }, { zh: "诸葛八卦村", en: "Zhuge Bagua Village" }] },
  { province: "浙江省", name: "衢州市", short: "衢州", en: "Quzhou", landmarks: [
    { zh: "江郎山", en: "Jianglang Mountain" }, { zh: "廿八都古镇", en: "Nianbadu Ancient Town" }] },
  { province: "浙江省", name: "舟山市", short: "舟山", en: "Zhoushan", landmarks: [
    { zh: "普陀山", en: "Mount Putuo" }] },
  { province: "浙江省", name: "台州市", short: "台州", landmarks: [
    { zh: "神仙居", en: "Shenxianju" }, { zh: "天台山", en: "Mount Tiantai" }] },
  { province: "浙江省", name: "丽水市", short: "丽水", landmarks: [
    { zh: "云和梯田", en: "Yunhe Rice Terraces" }, { zh: "古堰画乡", en: "Guyan Huaxiang" }] },
];

const shanghai: readonly CatalogCity[] = [
  { province: "上海市", name: "上海市", short: "上海", landmarks: [
    { zh: "外滩", en: "The Bund Shanghai" }, { zh: "东方明珠", en: "Oriental Pearl Tower" }] },
];

export const catalogBatches: readonly CatalogBatch[] = [
  { id: "jiangzhehu", cities: [...jiangsu, ...zhejiang, ...shanghai] },
];
