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

// 第二批：云南、四川、重庆、西藏里还没有代表图的城市（丽江、大理、迪庆、乐山、阿坝、甘孜、凉山、
// 拉萨、日喀则、林芝、那曲已有）。
const yunnan: readonly CatalogCity[] = [
  { province: "云南省", name: "昆明市", short: "昆明", en: "Kunming", landmarks: [
    { zh: "滇池", en: "Dianchi Lake" }, { zh: "石林", en: "Stone Forest Kunming" }] },
  { province: "云南省", name: "曲靖市", short: "曲靖", en: "Qujing", landmarks: [
    { zh: "罗平油菜花", en: "Luoping Rapeseed Flowers" }, { zh: "九龙瀑布", en: "Jiulong Waterfall Luoping" }] },
  { province: "云南省", name: "玉溪市", short: "玉溪", en: "Yuxi", landmarks: [
    { zh: "抚仙湖", en: "Fuxian Lake" }] },
  { province: "云南省", name: "保山市", short: "保山", en: "Baoshan Yunnan", landmarks: [
    { zh: "和顺古镇", en: "Heshun Ancient Town" }, { zh: "腾冲火山", en: "Tengchong Volcano" }] },
  { province: "云南省", name: "昭通市", short: "昭通", en: "Zhaotong", landmarks: [
    { zh: "大山包", en: "Dashanbao" }] },
  { province: "云南省", name: "普洱市", short: "普洱", en: "Pu'er Yunnan", landmarks: [
    { zh: "景迈山", en: "Jingmai Mountain" }, { zh: "普洱茶园", en: "Pu'er Tea Garden" }] },
  { province: "云南省", name: "临沧市", short: "临沧", en: "Lincang", landmarks: [
    { zh: "翁丁古寨", en: "Wengding Village" }] },
  { province: "云南省", name: "楚雄彝族自治州", short: "楚雄", en: "Chuxiong", landmarks: [
    { zh: "元谋土林", en: "Yuanmou Earth Forest" }] },
  { province: "云南省", name: "红河哈尼族彝族自治州", short: "红河", en: "Honghe Yunnan", landmarks: [
    { zh: "元阳梯田", en: "Yuanyang Rice Terraces" }, { zh: "建水古城", en: "Jianshui Ancient Town" }] },
  { province: "云南省", name: "文山壮族苗族自治州", short: "文山", en: "Wenshan Yunnan", landmarks: [
    { zh: "普者黑", en: "Puzhehei" }] },
  { province: "云南省", name: "西双版纳傣族自治州", short: "西双版纳", en: "Xishuangbanna", landmarks: [
    { zh: "告庄西双景", en: "Gaozhuang Xishuangjing" }, { zh: "野象谷", en: "Wild Elephant Valley" }] },
  { province: "云南省", name: "德宏傣族景颇族自治州", short: "德宏", en: "Dehong", landmarks: [
    { zh: "瑞丽", en: "Ruili" }, { zh: "芒市", en: "Mangshi" }] },
  { province: "云南省", name: "怒江傈僳族自治州", short: "怒江", en: "Nujiang", landmarks: [
    { zh: "丙中洛", en: "Bingzhongluo" }, { zh: "怒江大峡谷", en: "Nujiang Grand Canyon" }] },
];

const sichuan: readonly CatalogCity[] = [
  { province: "四川省", name: "成都市", short: "成都", en: "Chengdu", landmarks: [
    { zh: "大熊猫繁育研究基地", en: "Chengdu Research Base of Giant Panda Breeding" }, { zh: "宽窄巷子", en: "Kuanzhai Alley" }] },
  { province: "四川省", name: "自贡市", short: "自贡", en: "Zigong", landmarks: [
    { zh: "自贡灯会", en: "Zigong Lantern Festival" }, { zh: "自贡恐龙博物馆", en: "Zigong Dinosaur Museum" }] },
  { province: "四川省", name: "攀枝花市", short: "攀枝花", en: "Panzhihua", landmarks: [
    { zh: "二滩", en: "Ertan Panzhihua" }] },
  { province: "四川省", name: "泸州市", short: "泸州", en: "Luzhou", landmarks: [
    { zh: "黄荆老林", en: "Huangjing Laolin" }] },
  { province: "四川省", name: "德阳市", short: "德阳", en: "Deyang", landmarks: [
    { zh: "三星堆", en: "Sanxingdui" }] },
  { province: "四川省", name: "绵阳市", short: "绵阳", en: "Mianyang", landmarks: [
    { zh: "越王楼", en: "Yuewang Tower" }, { zh: "窦圌山", en: "Douchuan Mountain" }] },
  { province: "四川省", name: "广元市", short: "广元", en: "Guangyuan", landmarks: [
    { zh: "剑门关", en: "Jianmen Pass" }] },
  { province: "四川省", name: "遂宁市", short: "遂宁", en: "Suining", landmarks: [
    { zh: "中国死海", en: "Suining Dead Sea" }] },
  { province: "四川省", name: "内江市", short: "内江", en: "Neijiang", landmarks: [
    { zh: "隆昌石牌坊", en: "Longchang Stone Archways" }] },
  { province: "四川省", name: "南充市", short: "南充", en: "Nanchong", landmarks: [
    { zh: "阆中古城", en: "Langzhong Ancient Town" }] },
  { province: "四川省", name: "眉山市", short: "眉山", en: "Meishan", landmarks: [
    { zh: "瓦屋山", en: "Wawu Mountain" }, { zh: "三苏祠", en: "Sansu Shrine" }] },
  { province: "四川省", name: "宜宾市", short: "宜宾", en: "Yibin", landmarks: [
    { zh: "蜀南竹海", en: "Shunan Bamboo Sea" }] },
  { province: "四川省", name: "广安市", short: "广安", en: "Guang'an", landmarks: [
    { zh: "华蓥山", en: "Huaying Mountain" }] },
  { province: "四川省", name: "达州市", short: "达州", en: "Dazhou", landmarks: [
    { zh: "巴山大峡谷", en: "Bashan Grand Canyon" }] },
  { province: "四川省", name: "雅安市", short: "雅安", en: "Ya'an", landmarks: [
    { zh: "碧峰峡", en: "Bifengxia" }, { zh: "牛背山", en: "Niubei Mountain" }] },
  { province: "四川省", name: "巴中市", short: "巴中", en: "Bazhong", landmarks: [
    { zh: "光雾山", en: "Guangwu Mountain" }] },
  { province: "四川省", name: "资阳市", short: "资阳", en: "Ziyang Sichuan", landmarks: [
    { zh: "安岳石刻", en: "Anyue Grottoes" }] },
];

const chongqing: readonly CatalogCity[] = [
  { province: "重庆市", name: "重庆市", short: "重庆", en: "Chongqing", landmarks: [
    { zh: "洪崖洞", en: "Hongyadong" }, { zh: "解放碑", en: "Jiefangbei Chongqing" }] },
];

const tibet: readonly CatalogCity[] = [
  { province: "西藏自治区", name: "昌都市", short: "昌都", en: "Qamdo", landmarks: [
    { zh: "然乌湖", en: "Ranwu Lake" }, { zh: "来古冰川", en: "Laigu Glacier" }] },
  { province: "西藏自治区", name: "山南市", short: "山南", en: "Shannan Tibet", landmarks: [
    { zh: "羊卓雍错", en: "Yamdrok Lake" }, { zh: "雍布拉康", en: "Yumbulagang" }] },
  { province: "西藏自治区", name: "阿里地区", short: "阿里", en: "Ngari", landmarks: [
    { zh: "冈仁波齐", en: "Mount Kailash" }, { zh: "玛旁雍错", en: "Lake Manasarovar" }] },
];

export const catalogBatches: readonly CatalogBatch[] = [
  { id: "jiangzhehu", cities: [...jiangsu, ...zhejiang, ...shanghai] },
  { id: "southwest", cities: [...yunnan, ...sichuan, ...chongqing, ...tibet] },
];
