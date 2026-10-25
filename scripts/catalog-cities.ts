/**
 * 图集要覆盖的城市：每个地级行政区一张代表图。按批次登记，每批人工审核后才进图集。
 * scripts/build-city-catalog.ts 读这份清单，先在 Wikidata 找候选，没有再去 Pixabay。
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

const guangdong: readonly CatalogCity[] = [
  { province: "广东省", name: "广州市", short: "广州", en: "Guangzhou", landmarks: [
    { zh: "广州塔", en: "Canton Tower" }, { zh: "陈家祠", en: "Chen Clan Ancestral Hall" }] },
  { province: "广东省", name: "深圳市", short: "深圳", en: "Shenzhen", landmarks: [
    { zh: "深圳湾", en: "Shenzhen Bay" }, { zh: "大梅沙", en: "Dameisha" }] },
  { province: "广东省", name: "珠海市", short: "珠海", en: "Zhuhai", landmarks: [
    { zh: "珠海渔女", en: "Fisher Girl Zhuhai" }, { zh: "港珠澳大桥", en: "Hong Kong-Zhuhai-Macau Bridge" }] },
  { province: "广东省", name: "汕头市", short: "汕头", en: "Shantou", landmarks: [
    { zh: "南澳岛", en: "Nan'ao Island" }, { zh: "汕头小公园", en: "Shantou Xiaogongyuan" }] },
  { province: "广东省", name: "佛山市", short: "佛山", en: "Foshan", landmarks: [
    { zh: "佛山祖庙", en: "Foshan Ancestral Temple" }, { zh: "西樵山", en: "Mount Xiqiao" }] },
  { province: "广东省", name: "韶关市", short: "韶关", en: "Shaoguan", landmarks: [
    { zh: "丹霞山", en: "Mount Danxia" }, { zh: "南华寺", en: "Nanhua Temple" }] },
  { province: "广东省", name: "湛江市", short: "湛江", en: "Zhanjiang", landmarks: [
    { zh: "湖光岩", en: "Huguangyan" }, { zh: "硇洲岛", en: "Naozhou Island" }] },
  { province: "广东省", name: "肇庆市", short: "肇庆", en: "Zhaoqing", landmarks: [
    { zh: "七星岩", en: "Seven Star Crags" }, { zh: "鼎湖山", en: "Dinghu Mountain" }] },
  { province: "广东省", name: "江门市", short: "江门", en: "Jiangmen", landmarks: [
    { zh: "开平碉楼", en: "Kaiping Diaolou" }, { zh: "赤坎古镇", en: "Chikan Ancient Town" }] },
  { province: "广东省", name: "茂名市", short: "茂名", en: "Maoming", landmarks: [
    { zh: "放鸡岛", en: "Fangji Island" }, { zh: "中国第一滩", en: "China's First Beach Maoming" }] },
  { province: "广东省", name: "惠州市", short: "惠州", en: "Huizhou Guangdong", landmarks: [
    { zh: "惠州西湖", en: "Huizhou West Lake" }, { zh: "罗浮山", en: "Mount Luofu" }] },
  { province: "广东省", name: "梅州市", short: "梅州", en: "Meizhou", landmarks: [
    { zh: "雁南飞茶田", en: "Yannanfei Tea Field" }, { zh: "围龙屋", en: "Hakka Walled House" }] },
  { province: "广东省", name: "汕尾市", short: "汕尾", en: "Shanwei", landmarks: [
    { zh: "红海湾", en: "Honghai Bay" }, { zh: "玄武山", en: "Xuanwu Mountain Shanwei" }] },
  { province: "广东省", name: "河源市", short: "河源", en: "Heyuan", landmarks: [
    { zh: "万绿湖", en: "Wanlü Lake" }, { zh: "苏家围", en: "Sujiawei" }] },
  { province: "广东省", name: "阳江市", short: "阳江", en: "Yangjiang", landmarks: [
    { zh: "海陵岛", en: "Hailing Island" }, { zh: "闸坡", en: "Zhapo" }] },
  { province: "广东省", name: "清远市", short: "清远", en: "Qingyuan Guangdong", landmarks: [
    { zh: "英西峰林", en: "Yingxi Peak Forest" }, { zh: "连州地下河", en: "Lianzhou Underground River" }] },
  { province: "广东省", name: "东莞市", short: "东莞", en: "Dongguan", landmarks: [
    { zh: "可园", en: "Ke Garden" }, { zh: "虎门炮台", en: "Humen Fort" }] },
  { province: "广东省", name: "中山市", short: "中山", en: "Zhongshan Guangdong", landmarks: [
    { zh: "孙中山故居", en: "Sun Yat-sen's Former Residence" }, { zh: "詹园", en: "Zhan Garden" }] },
  { province: "广东省", name: "潮州市", short: "潮州", en: "Chaozhou", landmarks: [
    { zh: "广济桥", en: "Guangji Bridge" }, { zh: "牌坊街", en: "Paifang Street Chaozhou" }] },
  { province: "广东省", name: "揭阳市", short: "揭阳", en: "Jieyang", landmarks: [
    { zh: "揭阳学宫", en: "Jieyang Confucian Temple" }, { zh: "黄岐山", en: "Huangqi Mountain" }] },
  { province: "广东省", name: "云浮市", short: "云浮", en: "Yunfu", landmarks: [
    { zh: "国恩寺", en: "Guoen Temple" }, { zh: "蟠龙洞", en: "Panlong Cave" }] },
];

const guangxi: readonly CatalogCity[] = [
  { province: "广西壮族自治区", name: "南宁市", short: "南宁", en: "Nanning", landmarks: [
    { zh: "青秀山", en: "Qingxiu Mountain" }, { zh: "南湖公园", en: "Nanhu Park Nanning" }] },
  { province: "广西壮族自治区", name: "柳州市", short: "柳州", en: "Liuzhou", landmarks: [
    { zh: "柳江", en: "Liujiang River" }, { zh: "窑埠古镇", en: "Yaobu Ancient Town" }] },
  { province: "广西壮族自治区", name: "桂林市", short: "桂林", en: "Guilin", landmarks: [
    { zh: "漓江", en: "Li River" }, { zh: "象鼻山", en: "Elephant Trunk Hill" }] },
  { province: "广西壮族自治区", name: "梧州市", short: "梧州", en: "Wuzhou", landmarks: [
    { zh: "梧州骑楼城", en: "Wuzhou Arcade Street" }, { zh: "龙母庙", en: "Longmu Temple Wuzhou" }] },
  { province: "广西壮族自治区", name: "北海市", short: "北海", en: "Beihai", landmarks: [
    { zh: "涠洲岛", en: "Weizhou Island" }, { zh: "北海银滩", en: "Beihai Silver Beach" }] },
  { province: "广西壮族自治区", name: "防城港市", short: "防城港", en: "Fangchenggang", landmarks: [
    { zh: "京岛", en: "Jing Islands" }, { zh: "江山半岛", en: "Jiangshan Peninsula" }] },
  { province: "广西壮族自治区", name: "钦州市", short: "钦州", en: "Qinzhou", landmarks: [
    { zh: "三娘湾", en: "Sanniang Bay" }, { zh: "八寨沟", en: "Bazhaigou" }] },
  { province: "广西壮族自治区", name: "贵港市", short: "贵港", en: "Guigang", landmarks: [
    { zh: "桂平西山", en: "Guiping Xishan" }, { zh: "龙潭国家森林公园", en: "Longtan National Forest Park" }] },
  { province: "广西壮族自治区", name: "玉林市", short: "玉林", en: "Yulin Guangxi", landmarks: [
    { zh: "真武阁", en: "Zhenwu Pavilion" }, { zh: "大容山", en: "Darong Mountain" }] },
  { province: "广西壮族自治区", name: "百色市", short: "百色", en: "Baise", landmarks: [
    { zh: "通灵大峡谷", en: "Tongling Grand Canyon" }, { zh: "澄碧湖", en: "Chengbi Lake" }] },
  { province: "广西壮族自治区", name: "贺州市", short: "贺州", en: "Hezhou", landmarks: [
    { zh: "黄姚古镇", en: "Huangyao Ancient Town" }, { zh: "姑婆山", en: "Gupo Mountain" }] },
  { province: "广西壮族自治区", name: "河池市", short: "河池", en: "Hechi", landmarks: [
    { zh: "百魔洞", en: "Baimo Cave" }, { zh: "百鸟岩", en: "Bainiaoyan Cave" }] },
  { province: "广西壮族自治区", name: "来宾市", short: "来宾", en: "Laibin", landmarks: [
    { zh: "圣堂山", en: "Shengtang Mountain" }, { zh: "大瑶山", en: "Dayao Mountain" }] },
  { province: "广西壮族自治区", name: "崇左市", short: "崇左", en: "Chongzuo", landmarks: [
    { zh: "德天瀑布", en: "Detian Waterfall" }, { zh: "友谊关", en: "Friendship Pass" }] },
];

const hainan: readonly CatalogCity[] = [
  { province: "海南省", name: "海口市", short: "海口", en: "Haikou", landmarks: [
    { zh: "海口骑楼老街", en: "Haikou Qilou Old Street" }, { zh: "假日海滩", en: "Holiday Beach Haikou" }] },
  { province: "海南省", name: "三亚市", short: "三亚", en: "Sanya", landmarks: [
    { zh: "天涯海角", en: "Tianya Haijiao" }, { zh: "亚龙湾", en: "Yalong Bay" }] },
  { province: "海南省", name: "三沙市", short: "三沙", en: "Sansha", landmarks: [
    { zh: "永兴岛", en: "Yongxing Island" }, { zh: "七连屿", en: "Qilianyu" }] },
  { province: "海南省", name: "儋州市", short: "儋州", en: "Danzhou", landmarks: [
    { zh: "东坡书院", en: "Dongpo Academy" }, { zh: "石花水洞", en: "Shihua Cave" }] },
];

const fujian: readonly CatalogCity[] = [
  { province: "福建省", name: "福州市", short: "福州", en: "Fuzhou Fujian", landmarks: [
    { zh: "三坊七巷", en: "Three Lanes and Seven Alleys" }, { zh: "鼓山", en: "Mount Gu" }] },
  { province: "福建省", name: "厦门市", short: "厦门", en: "Xiamen", landmarks: [
    { zh: "鼓浪屿", en: "Gulangyu" }, { zh: "南普陀寺", en: "Nanputuo Temple" }] },
  { province: "福建省", name: "莆田市", short: "莆田", en: "Putian", landmarks: [
    { zh: "湄洲岛", en: "Meizhou Island" }, { zh: "木兰陂", en: "Mulan Weir" }] },
  { province: "福建省", name: "三明市", short: "三明", en: "Sanming", landmarks: [
    { zh: "大金湖", en: "Dajin Lake" }, { zh: "泰宁古城", en: "Taining Ancient Town" }] },
  { province: "福建省", name: "泉州市", short: "泉州", en: "Quanzhou", landmarks: [
    { zh: "开元寺", en: "Kaiyuan Temple Quanzhou" }, { zh: "清源山", en: "Mount Qingyuan" }] },
  { province: "福建省", name: "漳州市", short: "漳州", en: "Zhangzhou", landmarks: [
    { zh: "南靖土楼", en: "Nanjing Tulou" }, { zh: "云水谣", en: "Yunshuiyao" }] },
  { province: "福建省", name: "南平市", short: "南平", en: "Nanping", landmarks: [
    { zh: "武夷山", en: "Mount Wuyi" }, { zh: "天游峰", en: "Tianyou Peak" }] },
  { province: "福建省", name: "龙岩市", short: "龙岩", en: "Longyan", landmarks: [
    { zh: "永定土楼", en: "Yongding Tulou" }, { zh: "冠豸山", en: "Guanzhai Mountain" }] },
  { province: "福建省", name: "宁德市", short: "宁德", en: "Ningde", landmarks: [
    { zh: "太姥山", en: "Mount Taimu" }, { zh: "霞浦滩涂", en: "Xiapu Mudflats" }] },
];

const tianjin: readonly CatalogCity[] = [
  { province: "天津市", name: "天津市", short: "天津", en: "Tianjin", landmarks: [
    { zh: "天津之眼", en: "Tianjin Eye" }, { zh: "五大道", en: "Five Great Avenues" }] },
];

const hebei: readonly CatalogCity[] = [
  { province: "河北省", name: "石家庄市", short: "石家庄", en: "Shijiazhuang", landmarks: [
    { zh: "赵州桥", en: "Zhaozhou Bridge" }, { zh: "正定古城", en: "Zhengding Ancient City" }] },
  { province: "河北省", name: "唐山市", short: "唐山", en: "Tangshan", landmarks: [
    { zh: "唐山南湖", en: "Tangshan Nanhu Park" }, { zh: "清东陵", en: "Eastern Qing Tombs" }] },
  { province: "河北省", name: "秦皇岛市", short: "秦皇岛", en: "Qinhuangdao", landmarks: [
    { zh: "山海关", en: "Shanhai Pass" }, { zh: "北戴河", en: "Beidaihe" }] },
  { province: "河北省", name: "邯郸市", short: "邯郸", en: "Handan", landmarks: [
    { zh: "广府古城", en: "Guangfu Ancient City" }, { zh: "娲皇宫", en: "Wahuang Palace" }] },
  { province: "河北省", name: "邢台市", short: "邢台", en: "Xingtai", landmarks: [
    { zh: "崆山白云洞", en: "Kongshan Baiyun Cave" }, { zh: "邢台大峡谷", en: "Xingtai Grand Canyon" }] },
  { province: "河北省", name: "保定市", short: "保定", en: "Baoding", landmarks: [
    { zh: "白洋淀", en: "Baiyangdian" }, { zh: "直隶总督署", en: "Zhili Governor's Office" }] },
  { province: "河北省", name: "张家口市", short: "张家口", en: "Zhangjiakou", landmarks: [
    { zh: "大境门", en: "Dajingmen" }, { zh: "崇礼", en: "Chongli" }] },
  { province: "河北省", name: "承德市", short: "承德", en: "Chengde", landmarks: [
    { zh: "避暑山庄", en: "Chengde Mountain Resort" }, { zh: "普宁寺", en: "Puning Temple" }] },
  { province: "河北省", name: "沧州市", short: "沧州", en: "Cangzhou", landmarks: [
    { zh: "沧州铁狮子", en: "Iron Lion of Cangzhou" }, { zh: "吴桥杂技大世界", en: "Wuqiao Acrobatics World" }] },
  { province: "河北省", name: "廊坊市", short: "廊坊", en: "Langfang", landmarks: [
    { zh: "天下第一城", en: "First City Under Heaven" }, { zh: "胜芳古镇", en: "Shengfang Ancient Town" }] },
  { province: "河北省", name: "衡水市", short: "衡水", en: "Hengshui", landmarks: [
    { zh: "衡水湖", en: "Hengshui Lake" }, { zh: "宝云塔", en: "Baoyun Pagoda" }] },
];

const shanxi: readonly CatalogCity[] = [
  { province: "山西省", name: "太原市", short: "太原", en: "Taiyuan", landmarks: [
    { zh: "晋祠", en: "Jinci Temple" }, { zh: "双塔寺", en: "Twin Pagoda Temple" }] },
  { province: "山西省", name: "大同市", short: "大同", en: "Datong", landmarks: [
    { zh: "云冈石窟", en: "Yungang Grottoes" }, { zh: "悬空寺", en: "Hanging Temple" }] },
  { province: "山西省", name: "阳泉市", short: "阳泉", en: "Yangquan", landmarks: [
    { zh: "娘子关", en: "Niangzi Pass" }, { zh: "藏山", en: "Cangshan Yangquan" }] },
  { province: "山西省", name: "长治市", short: "长治", en: "Changzhi", landmarks: [
    { zh: "太行山大峡谷", en: "Taihang Grand Canyon" }, { zh: "通天峡", en: "Tongtian Gorge" }] },
  { province: "山西省", name: "晋城市", short: "晋城", en: "Jincheng", landmarks: [
    { zh: "皇城相府", en: "Huangcheng Xiangfu" }, { zh: "王莽岭", en: "Wangmang Ridge" }] },
  { province: "山西省", name: "朔州市", short: "朔州", en: "Shuozhou", landmarks: [
    { zh: "应县木塔", en: "Yingxian Wooden Pagoda" }, { zh: "崇福寺", en: "Chongfu Temple" }] },
  { province: "山西省", name: "晋中市", short: "晋中", en: "Jinzhong", landmarks: [
    { zh: "平遥古城", en: "Pingyao Ancient City" }, { zh: "乔家大院", en: "Qiao Family Compound" }] },
  { province: "山西省", name: "运城市", short: "运城", en: "Yuncheng", landmarks: [
    { zh: "鹳雀楼", en: "Stork Tower" }, { zh: "解州关帝庙", en: "Xiezhou Guandi Temple" }] },
  { province: "山西省", name: "忻州市", short: "忻州", en: "Xinzhou", landmarks: [
    { zh: "五台山", en: "Mount Wutai" }, { zh: "雁门关", en: "Yanmen Pass" }] },
  { province: "山西省", name: "临汾市", short: "临汾", en: "Linfen", landmarks: [
    { zh: "壶口瀑布", en: "Hukou Waterfall" }, { zh: "云丘山", en: "Yunqiu Mountain" }] },
  { province: "山西省", name: "吕梁市", short: "吕梁", en: "Lüliang", landmarks: [
    { zh: "碛口古镇", en: "Qikou Ancient Town" }, { zh: "北武当山", en: "Mount Beiwudang" }] },
];

const innerMongolia: readonly CatalogCity[] = [
  { province: "内蒙古自治区", name: "呼和浩特市", short: "呼和浩特", en: "Hohhot", landmarks: [
    { zh: "大召寺", en: "Dazhao Temple" }, { zh: "昭君墓", en: "Tomb of Wang Zhaojun" }] },
  { province: "内蒙古自治区", name: "包头市", short: "包头", en: "Baotou", landmarks: [
    { zh: "五当召", en: "Wudang Lamasery" }, { zh: "赛汗塔拉", en: "Saihantala" }] },
  { province: "内蒙古自治区", name: "乌海市", short: "乌海", en: "Wuhai", landmarks: [
    { zh: "乌海湖", en: "Wuhai Lake" }, { zh: "甘德尔山", en: "Gandeer Mountain" }] },
  { province: "内蒙古自治区", name: "赤峰市", short: "赤峰", en: "Chifeng", landmarks: [
    { zh: "阿斯哈图石林", en: "Asihatu Stone Forest" }, { zh: "乌兰布统", en: "Ulan Butong" }] },
  { province: "内蒙古自治区", name: "通辽市", short: "通辽", en: "Tongliao", landmarks: [
    { zh: "大青沟", en: "Daqinggou" }, { zh: "扎鲁特草原", en: "Jarud Grassland" }] },
  { province: "内蒙古自治区", name: "鄂尔多斯市", short: "鄂尔多斯", en: "Ordos", landmarks: [
    { zh: "响沙湾", en: "Xiangshawan" }, { zh: "成吉思汗陵", en: "Mausoleum of Genghis Khan" }] },
  { province: "内蒙古自治区", name: "巴彦淖尔市", short: "巴彦淖尔", en: "Bayannur", landmarks: [
    { zh: "乌梁素海", en: "Ulansuhai Lake" }, { zh: "阴山岩画", en: "Yinshan Rock Paintings" }] },
  { province: "内蒙古自治区", name: "乌兰察布市", short: "乌兰察布", en: "Ulanqab", landmarks: [
    { zh: "辉腾锡勒草原", en: "Huitengxile Grassland" }, { zh: "岱海", en: "Daihai Lake" }] },
  { province: "内蒙古自治区", name: "兴安盟", short: "兴安", en: "Hinggan League", landmarks: [
    { zh: "阿尔山", en: "Arxan" }, { zh: "成吉思汗庙", en: "Genghis Khan Temple Ulanhot" }] },
  { province: "内蒙古自治区", name: "锡林郭勒盟", short: "锡林郭勒", en: "Xilingol", landmarks: [
    { zh: "锡林郭勒草原", en: "Xilingol Grassland" }, { zh: "元上都遗址", en: "Xanadu" }] },
  { province: "内蒙古自治区", name: "阿拉善盟", short: "阿拉善", en: "Alxa", landmarks: [
    { zh: "额济纳胡杨林", en: "Ejina Populus Forest" }, { zh: "巴丹吉林沙漠", en: "Badain Jaran Desert" }] },
];

const henan: readonly CatalogCity[] = [
  { province: "河南省", name: "郑州市", short: "郑州", en: "Zhengzhou", landmarks: [
    { zh: "少林寺", en: "Shaolin Monastery" }, { zh: "二七纪念塔", en: "Erqi Memorial Tower" }] },
  { province: "河南省", name: "开封市", short: "开封", en: "Kaifeng", landmarks: [
    { zh: "清明上河园", en: "Millennium City Park" }, { zh: "开封铁塔", en: "Iron Pagoda Kaifeng" }] },
  { province: "河南省", name: "洛阳市", short: "洛阳", en: "Luoyang", landmarks: [
    { zh: "龙门石窟", en: "Longmen Grottoes" }, { zh: "白马寺", en: "White Horse Temple" }] },
  { province: "河南省", name: "平顶山市", short: "平顶山", en: "Pingdingshan", landmarks: [
    { zh: "尧山", en: "Yaoshan" }, { zh: "中原大佛", en: "Spring Temple Buddha" }] },
  { province: "河南省", name: "安阳市", short: "安阳", en: "Anyang", landmarks: [
    { zh: "殷墟", en: "Yinxu" }, { zh: "红旗渠", en: "Red Flag Canal" }] },
  { province: "河南省", name: "鹤壁市", short: "鹤壁", en: "Hebi", landmarks: [
    { zh: "云梦山", en: "Yunmeng Mountain" }, { zh: "浚县古城", en: "Xunxian Ancient Town" }] },
  { province: "河南省", name: "新乡市", short: "新乡", en: "Xinxiang", landmarks: [
    { zh: "万仙山", en: "Wanxian Mountain" }, { zh: "八里沟", en: "Baligou" }] },
  { province: "河南省", name: "焦作市", short: "焦作", en: "Jiaozuo", landmarks: [
    { zh: "云台山", en: "Yuntai Mountain" }, { zh: "青天河", en: "Qingtian River" }] },
  { province: "河南省", name: "濮阳市", short: "濮阳", en: "Puyang", landmarks: [
    { zh: "戚城", en: "Qicheng" }, { zh: "张挥公园", en: "Zhanghui Park" }] },
  { province: "河南省", name: "许昌市", short: "许昌", en: "Xuchang", landmarks: [
    { zh: "春秋楼", en: "Chunqiu Tower Xuchang" }, { zh: "神垕古镇", en: "Shenhou Ancient Town" }] },
  { province: "河南省", name: "漯河市", short: "漯河", en: "Luohe", landmarks: [
    { zh: "沙澧河", en: "Shali River" }, { zh: "许慎文化园", en: "Xu Shen Culture Park" }] },
  { province: "河南省", name: "三门峡市", short: "三门峡", en: "Sanmenxia", landmarks: [
    { zh: "天鹅湖", en: "Swan Lake Sanmenxia" }, { zh: "函谷关", en: "Hangu Pass" }] },
  { province: "河南省", name: "南阳市", short: "南阳", en: "Nanyang Henan", landmarks: [
    { zh: "南阳武侯祠", en: "Nanyang Wuhou Temple" }, { zh: "老界岭", en: "Laojieling" }] },
  { province: "河南省", name: "商丘市", short: "商丘", en: "Shangqiu", landmarks: [
    { zh: "商丘古城", en: "Shangqiu Ancient City" }, { zh: "芒砀山", en: "Mangdang Mountain" }] },
  { province: "河南省", name: "信阳市", short: "信阳", en: "Xinyang", landmarks: [
    { zh: "鸡公山", en: "Jigong Mountain" }, { zh: "南湾湖", en: "Nanwan Lake" }] },
  { province: "河南省", name: "周口市", short: "周口", en: "Zhoukou", landmarks: [
    { zh: "太昊陵", en: "Taihao Mausoleum" }, { zh: "太清宫", en: "Taiqing Palace Luyi" }] },
  { province: "河南省", name: "驻马店市", short: "驻马店", en: "Zhumadian", landmarks: [
    { zh: "嵖岈山", en: "Chaya Mountain" }, { zh: "铜山湖", en: "Tongshan Lake" }] },
];

const hubei: readonly CatalogCity[] = [
  { province: "湖北省", name: "武汉市", short: "武汉", en: "Wuhan", landmarks: [
    { zh: "黄鹤楼", en: "Yellow Crane Tower" }, { zh: "东湖", en: "East Lake Wuhan" }] },
  { province: "湖北省", name: "黄石市", short: "黄石", en: "Huangshi", landmarks: [
    { zh: "东方山", en: "Dongfang Mountain" }, { zh: "磁湖", en: "Cihu Lake" }] },
  { province: "湖北省", name: "十堰市", short: "十堰", en: "Shiyan", landmarks: [
    { zh: "武当山", en: "Wudang Mountains" }, { zh: "丹江口水库", en: "Danjiangkou Reservoir" }] },
  { province: "湖北省", name: "宜昌市", short: "宜昌", en: "Yichang", landmarks: [
    { zh: "三峡大坝", en: "Three Gorges Dam" }, { zh: "三峡人家", en: "Three Gorges Tribe" }] },
  { province: "湖北省", name: "襄阳市", short: "襄阳", en: "Xiangyang", landmarks: [
    { zh: "古隆中", en: "Gulongzhong" }, { zh: "襄阳古城", en: "Xiangyang Ancient City" }] },
  { province: "湖北省", name: "鄂州市", short: "鄂州", en: "Ezhou", landmarks: [
    { zh: "西山", en: "West Mountain Ezhou" }, { zh: "梁子湖", en: "Liangzi Lake" }] },
  { province: "湖北省", name: "荆门市", short: "荆门", en: "Jingmen", landmarks: [
    { zh: "明显陵", en: "Xianling Tomb" }, { zh: "漳河", en: "Zhanghe Reservoir" }] },
  { province: "湖北省", name: "孝感市", short: "孝感", en: "Xiaogan", landmarks: [
    { zh: "双峰山", en: "Shuangfeng Mountain" }, { zh: "董永公园", en: "Dongyong Park" }] },
  { province: "湖北省", name: "荆州市", short: "荆州", en: "Jingzhou", landmarks: [
    { zh: "荆州古城", en: "Jingzhou Ancient City" }, { zh: "洪湖", en: "Honghu Lake" }] },
  { province: "湖北省", name: "黄冈市", short: "黄冈", en: "Huanggang", landmarks: [
    { zh: "东坡赤壁", en: "Dongpo Red Cliff" }, { zh: "天堂寨", en: "Tiantangzhai" }] },
  { province: "湖北省", name: "咸宁市", short: "咸宁", en: "Xianning", landmarks: [
    { zh: "九宫山", en: "Jiugong Mountain" }, { zh: "赤壁古战场", en: "Chibi Battlefield" }] },
  { province: "湖北省", name: "随州市", short: "随州", en: "Suizhou", landmarks: [
    { zh: "大洪山", en: "Dahong Mountain" }, { zh: "炎帝故里", en: "Yandi Hometown" }] },
  { province: "湖北省", name: "恩施土家族苗族自治州", short: "恩施", en: "Enshi", landmarks: [
    { zh: "恩施大峡谷", en: "Enshi Grand Canyon" }, { zh: "腾龙洞", en: "Tenglong Cave" }] },
];

const hunan: readonly CatalogCity[] = [
  { province: "湖南省", name: "长沙市", short: "长沙", en: "Changsha", landmarks: [
    { zh: "橘子洲", en: "Orange Isle" }, { zh: "岳麓山", en: "Yuelu Mountain" }] },
  { province: "湖南省", name: "株洲市", short: "株洲", en: "Zhuzhou", landmarks: [
    { zh: "炎帝陵", en: "Yandi Mausoleum" }, { zh: "神农谷", en: "Shennong Valley" }] },
  { province: "湖南省", name: "湘潭市", short: "湘潭", en: "Xiangtan", landmarks: [
    { zh: "韶山", en: "Shaoshan" }, { zh: "昭山", en: "Zhaoshan" }] },
  { province: "湖南省", name: "衡阳市", short: "衡阳", en: "Hengyang", landmarks: [
    { zh: "衡山", en: "Mount Heng" }, { zh: "南岳大庙", en: "Grand Temple of Mount Heng" }] },
  { province: "湖南省", name: "邵阳市", short: "邵阳", en: "Shaoyang", landmarks: [
    { zh: "崀山", en: "Langshan" }, { zh: "南山牧场", en: "Nanshan Ranch" }] },
  { province: "湖南省", name: "岳阳市", short: "岳阳", en: "Yueyang", landmarks: [
    { zh: "岳阳楼", en: "Yueyang Tower" }, { zh: "洞庭湖", en: "Dongting Lake" }] },
  { province: "湖南省", name: "常德市", short: "常德", en: "Changde", landmarks: [
    { zh: "桃花源", en: "Peach Blossom Land" }, { zh: "柳叶湖", en: "Liuye Lake" }] },
  { province: "湖南省", name: "益阳市", short: "益阳", en: "Yiyang", landmarks: [
    { zh: "桃花江", en: "Taohuajiang" }, { zh: "茶马古道", en: "Tea Horse Road Anhua" }] },
  { province: "湖南省", name: "郴州市", short: "郴州", en: "Chenzhou", landmarks: [
    { zh: "东江湖", en: "Dongjiang Lake" }, { zh: "莽山", en: "Mangshan" }] },
  { province: "湖南省", name: "永州市", short: "永州", en: "Yongzhou", landmarks: [
    { zh: "九嶷山", en: "Jiuyi Mountain" }, { zh: "阳明山", en: "Yangming Mountain" }] },
  { province: "湖南省", name: "怀化市", short: "怀化", en: "Huaihua", landmarks: [
    { zh: "洪江古商城", en: "Hongjiang Ancient Commercial City" }, { zh: "黔阳古城", en: "Qianyang Ancient Town" }] },
  { province: "湖南省", name: "娄底市", short: "娄底", en: "Loudi", landmarks: [
    { zh: "紫鹊界梯田", en: "Ziquejie Terraces" }, { zh: "梅山龙宫", en: "Meishan Dragon Palace" }] },
  { province: "湖南省", name: "湘西土家族苗族自治州", short: "湘西", en: "Xiangxi", landmarks: [
    { zh: "凤凰古城", en: "Fenghuang Ancient Town" }, { zh: "芙蓉镇", en: "Furong Town" }] },
];

const jiangxi: readonly CatalogCity[] = [
  { province: "江西省", name: "南昌市", short: "南昌", en: "Nanchang", landmarks: [
    { zh: "滕王阁", en: "Pavilion of Prince Teng" }, { zh: "八一广场", en: "Bayi Square" }] },
  { province: "江西省", name: "景德镇市", short: "景德镇", en: "Jingdezhen", landmarks: [
    { zh: "古窑民俗博览区", en: "Ancient Kiln Folk Customs Expo Area" }, { zh: "瑶里", en: "Yaoli" }] },
  { province: "江西省", name: "萍乡市", short: "萍乡", en: "Pingxiang", landmarks: [
    { zh: "武功山", en: "Wugong Mountain" }, { zh: "杨岐山", en: "Yangqi Mountain" }] },
  { province: "江西省", name: "九江市", short: "九江", en: "Jiujiang", landmarks: [
    { zh: "庐山", en: "Mount Lu" }, { zh: "浔阳楼", en: "Xunyang Tower" }] },
  { province: "江西省", name: "新余市", short: "新余", en: "Xinyu", landmarks: [
    { zh: "仙女湖", en: "Xiannü Lake" }, { zh: "抱石公园", en: "Baoshi Park" }] },
  { province: "江西省", name: "鹰潭市", short: "鹰潭", en: "Yingtan", landmarks: [
    { zh: "龙虎山", en: "Mount Longhu" }, { zh: "上清古镇", en: "Shangqing Ancient Town" }] },
  { province: "江西省", name: "赣州市", short: "赣州", en: "Ganzhou", landmarks: [
    { zh: "通天岩", en: "Tongtian Rock" }, { zh: "郁孤台", en: "Yugu Terrace" }] },
  { province: "江西省", name: "吉安市", short: "吉安", en: "Ji'an", landmarks: [
    { zh: "井冈山", en: "Jinggang Mountains" }, { zh: "白鹭洲书院", en: "Bailuzhou Academy" }] },
  { province: "江西省", name: "宜春市", short: "宜春", en: "Yichun Jiangxi", landmarks: [
    { zh: "明月山", en: "Mingyue Mountain" }, { zh: "三爪仑", en: "Sanzhualun" }] },
  { province: "江西省", name: "抚州市", short: "抚州", en: "Fuzhou Jiangxi", landmarks: [
    { zh: "大觉山", en: "Dajue Mountain" }, { zh: "流坑古村", en: "Liukeng Village" }] },
];

const anhui: readonly CatalogCity[] = [
  { province: "安徽省", name: "合肥市", short: "合肥", en: "Hefei", landmarks: [
    { zh: "包公园", en: "Baogong Park" }, { zh: "三河古镇", en: "Sanhe Ancient Town" }] },
  { province: "安徽省", name: "芜湖市", short: "芜湖", en: "Wuhu", landmarks: [
    { zh: "镜湖", en: "Jinghu Lake Wuhu" }, { zh: "天门山", en: "Tianmen Mountain Wuhu" }] },
  { province: "安徽省", name: "蚌埠市", short: "蚌埠", en: "Bengbu", landmarks: [
    { zh: "龙子湖", en: "Longzi Lake" }, { zh: "涂山", en: "Mount Tu" }] },
  { province: "安徽省", name: "淮南市", short: "淮南", en: "Huainan", landmarks: [
    { zh: "八公山", en: "Bagong Mountain" }, { zh: "焦岗湖", en: "Jiaogang Lake" }] },
  { province: "安徽省", name: "马鞍山市", short: "马鞍山", en: "Ma'anshan", landmarks: [
    { zh: "采石矶", en: "Caishiji" }, { zh: "濮塘", en: "Putang" }] },
  { province: "安徽省", name: "淮北市", short: "淮北", en: "Huaibei", landmarks: [
    { zh: "相山", en: "Xiangshan Huaibei" }, { zh: "隋唐运河古镇", en: "Sui-Tang Canal Town" }] },
  { province: "安徽省", name: "铜陵市", short: "铜陵", en: "Tongling", landmarks: [
    { zh: "天井湖", en: "Tianjing Lake" }, { zh: "大通古镇", en: "Datong Ancient Town" }] },
  { province: "安徽省", name: "安庆市", short: "安庆", en: "Anqing", landmarks: [
    { zh: "天柱山", en: "Mount Tianzhu" }, { zh: "振风塔", en: "Zhenfeng Pagoda" }] },
  { province: "安徽省", name: "滁州市", short: "滁州", en: "Chuzhou", landmarks: [
    { zh: "琅琊山", en: "Langya Mountain" }, { zh: "醉翁亭", en: "Zuiweng Pavilion" }] },
  { province: "安徽省", name: "阜阳市", short: "阜阳", en: "Fuyang", landmarks: [
    { zh: "八里河", en: "Balihe" }, { zh: "颍州西湖", en: "Yingzhou West Lake" }] },
  { province: "安徽省", name: "宿州市", short: "宿州", en: "Suzhou Anhui", landmarks: [
    { zh: "皇藏峪", en: "Huangcangyu" }, { zh: "五柳风景区", en: "Wuliu Scenic Area" }] },
  { province: "安徽省", name: "六安市", short: "六安", en: "Lu'an", landmarks: [
    { zh: "万佛湖", en: "Wanfo Lake" }, { zh: "天堂寨", en: "Tiantangzhai Anhui" }] },
  { province: "安徽省", name: "亳州市", short: "亳州", en: "Bozhou", landmarks: [
    { zh: "花戏楼", en: "Huaxi Tower" }, { zh: "曹操运兵道", en: "Cao Cao Military Tunnel" }] },
  { province: "安徽省", name: "池州市", short: "池州", en: "Chizhou", landmarks: [
    { zh: "九华山", en: "Mount Jiuhua" }, { zh: "杏花村", en: "Xinghua Village Chizhou" }] },
  { province: "安徽省", name: "宣城市", short: "宣城", en: "Xuancheng", landmarks: [
    { zh: "敬亭山", en: "Jingting Mountain" }, { zh: "桃花潭", en: "Taohua Pond" }] },
];

const liaoning: readonly CatalogCity[] = [
  { province: "辽宁省", name: "沈阳市", short: "沈阳", en: "Shenyang", landmarks: [
    { zh: "沈阳故宫", en: "Mukden Palace" }, { zh: "清昭陵", en: "Zhaoling Mausoleum" }] },
  { province: "辽宁省", name: "大连市", short: "大连", en: "Dalian", landmarks: [
    { zh: "星海广场", en: "Xinghai Square" }, { zh: "老虎滩", en: "Tiger Beach Dalian" }] },
  { province: "辽宁省", name: "鞍山市", short: "鞍山", en: "Anshan", landmarks: [
    { zh: "千山", en: "Qianshan" }, { zh: "玉佛苑", en: "Jade Buddha Palace" }] },
  { province: "辽宁省", name: "抚顺市", short: "抚顺", en: "Fushun", landmarks: [
    { zh: "赫图阿拉城", en: "Hetu Ala" }, { zh: "抚顺西露天矿", en: "Fushun West Open-pit Mine" }] },
  { province: "辽宁省", name: "本溪市", short: "本溪", en: "Benxi", landmarks: [
    { zh: "本溪水洞", en: "Benxi Water Cave" }, { zh: "关门山", en: "Guanmen Mountain" }] },
  { province: "辽宁省", name: "丹东市", short: "丹东", en: "Dandong", landmarks: [
    { zh: "鸭绿江断桥", en: "Broken Bridge Yalu River" }, { zh: "虎山长城", en: "Hushan Great Wall" }] },
  { province: "辽宁省", name: "锦州市", short: "锦州", en: "Jinzhou Liaoning", landmarks: [
    { zh: "笔架山", en: "Bijia Mountain" }, { zh: "锦州古塔", en: "Jinzhou Ancient Pagoda" }] },
  { province: "辽宁省", name: "营口市", short: "营口", en: "Yingkou", landmarks: [
    { zh: "鲅鱼圈", en: "Bayuquan" }, { zh: "西炮台", en: "Xipaotai Fort" }] },
  { province: "辽宁省", name: "阜新市", short: "阜新", en: "Fuxin", landmarks: [
    { zh: "海棠山", en: "Haitang Mountain" }, { zh: "瑞应寺", en: "Ruiying Temple" }] },
  { province: "辽宁省", name: "辽阳市", short: "辽阳", en: "Liaoyang", landmarks: [
    { zh: "辽阳白塔", en: "Liaoyang White Pagoda" }, { zh: "弓长岭", en: "Gongchangling" }] },
  { province: "辽宁省", name: "盘锦市", short: "盘锦", en: "Panjin", landmarks: [
    { zh: "红海滩", en: "Red Beach Panjin" }, { zh: "辽河口湿地", en: "Liao River Delta Wetland" }] },
  { province: "辽宁省", name: "铁岭市", short: "铁岭", en: "Tieling", landmarks: [
    { zh: "龙首山", en: "Longshou Mountain Tieling" }, { zh: "莲花湖", en: "Lianhua Lake Tieling" }] },
  { province: "辽宁省", name: "朝阳市", short: "朝阳", en: "Chaoyang Liaoning", landmarks: [
    { zh: "凤凰山", en: "Fenghuang Mountain Chaoyang" }, { zh: "朝阳北塔", en: "North Pagoda Chaoyang" }] },
  { province: "辽宁省", name: "葫芦岛市", short: "葫芦岛", en: "Huludao", landmarks: [
    { zh: "兴城古城", en: "Xingcheng Ancient City" }, { zh: "觉华岛", en: "Juehua Island" }] },
];

const jilin: readonly CatalogCity[] = [
  { province: "吉林省", name: "长春市", short: "长春", en: "Changchun", landmarks: [
    { zh: "伪满皇宫", en: "Puppet Manchukuo Palace" }, { zh: "净月潭", en: "Jingyuetan" }] },
  { province: "吉林省", name: "吉林市", short: "吉林", en: "Jilin City", landmarks: [
    { zh: "松花湖", en: "Songhua Lake" }, { zh: "雾凇岛", en: "Wusong Island" }] },
  { province: "吉林省", name: "四平市", short: "四平", en: "Siping", landmarks: [
    { zh: "叶赫古城", en: "Yehe Ancient City" }, { zh: "二龙湖", en: "Erlong Lake" }] },
  { province: "吉林省", name: "辽源市", short: "辽源", en: "Liaoyuan", landmarks: [
    { zh: "龙首山", en: "Longshou Mountain Liaoyuan" }, { zh: "鴜鹭湖", en: "Cilu Lake" }] },
  { province: "吉林省", name: "通化市", short: "通化", en: "Tonghua", landmarks: [
    { zh: "高句丽王城", en: "Capital Cities of Koguryo" }, { zh: "五女峰", en: "Wunü Peak" }] },
  { province: "吉林省", name: "松原市", short: "松原", en: "Songyuan", landmarks: [
    { zh: "查干湖", en: "Chagan Lake" }, { zh: "龙华寺", en: "Longhua Temple Songyuan" }] },
  { province: "吉林省", name: "白城市", short: "白城", en: "Baicheng", landmarks: [
    { zh: "向海", en: "Xianghai" }, { zh: "莫莫格", en: "Momoge" }] },
];

const heilongjiang: readonly CatalogCity[] = [
  { province: "黑龙江省", name: "哈尔滨市", short: "哈尔滨", en: "Harbin", landmarks: [
    { zh: "圣索菲亚教堂", en: "Saint Sophia Cathedral Harbin" }, { zh: "中央大街", en: "Central Street Harbin" }] },
  { province: "黑龙江省", name: "齐齐哈尔市", short: "齐齐哈尔", en: "Qiqihar", landmarks: [
    { zh: "扎龙", en: "Zhalong" }, { zh: "明月岛", en: "Mingyue Island" }] },
  { province: "黑龙江省", name: "鸡西市", short: "鸡西", en: "Jixi", landmarks: [
    { zh: "兴凯湖", en: "Xingkai Lake" }, { zh: "珍宝岛", en: "Zhenbao Island" }] },
  { province: "黑龙江省", name: "鹤岗市", short: "鹤岗", en: "Hegang", landmarks: [
    { zh: "名山", en: "Mingshan Luobei" }, { zh: "龙江三峡", en: "Longjiang Three Gorges" }] },
  { province: "黑龙江省", name: "双鸭山市", short: "双鸭山", en: "Shuangyashan", landmarks: [
    { zh: "七星峰", en: "Qixing Peak" }, { zh: "安邦河", en: "Anbang River" }] },
  { province: "黑龙江省", name: "大庆市", short: "大庆", en: "Daqing", landmarks: [
    { zh: "连环湖", en: "Lianhuan Lake" }, { zh: "龙凤湿地", en: "Longfeng Wetland" }] },
  { province: "黑龙江省", name: "伊春市", short: "伊春", en: "Yichun Heilongjiang", landmarks: [
    { zh: "汤旺河", en: "Tangwang River" }, { zh: "五营", en: "Wuying Forest Park" }] },
  { province: "黑龙江省", name: "佳木斯市", short: "佳木斯", en: "Jiamusi", landmarks: [
    { zh: "黑瞎子岛", en: "Bolshoy Ussuriysky Island" }, { zh: "街津口", en: "Jiejinkou" }] },
  { province: "黑龙江省", name: "七台河市", short: "七台河", en: "Qitaihe", landmarks: [
    { zh: "石龙山", en: "Shilong Mountain" }, { zh: "桃山湖", en: "Taoshan Lake" }] },
  { province: "黑龙江省", name: "牡丹江市", short: "牡丹江", en: "Mudanjiang", landmarks: [
    { zh: "镜泊湖", en: "Jingpo Lake" }, { zh: "雪乡", en: "China Snow Town" }] },
  { province: "黑龙江省", name: "黑河市", short: "黑河", en: "Heihe", landmarks: [
    { zh: "五大连池", en: "Wudalianchi" }, { zh: "瑷珲古城", en: "Aihui" }] },
  { province: "黑龙江省", name: "绥化市", short: "绥化", en: "Suihua", landmarks: [
    { zh: "绥化西湖", en: "Suihua West Lake" }, { zh: "诺敏河", en: "Nuomin River" }] },
  { province: "黑龙江省", name: "大兴安岭地区", short: "大兴安岭", en: "Greater Khingan", landmarks: [
    { zh: "北极村", en: "Beiji Village Mohe" }, { zh: "九曲十八弯", en: "Jiuqu Shiba Wan Huzhong" }] },
];

const shaanxi: readonly CatalogCity[] = [
  { province: "陕西省", name: "西安市", short: "西安", en: "Xi'an", landmarks: [
    { zh: "兵马俑", en: "Terracotta Army" }, { zh: "大雁塔", en: "Giant Wild Goose Pagoda" }] },
  { province: "陕西省", name: "铜川市", short: "铜川", en: "Tongchuan", landmarks: [
    { zh: "药王山", en: "Yaowang Mountain" }, { zh: "照金", en: "Zhaojin" }] },
  { province: "陕西省", name: "宝鸡市", short: "宝鸡", en: "Baoji", landmarks: [
    { zh: "法门寺", en: "Famen Temple" }, { zh: "太白山", en: "Mount Taibai" }] },
  { province: "陕西省", name: "咸阳市", short: "咸阳", en: "Xianyang", landmarks: [
    { zh: "乾陵", en: "Qianling Mausoleum" }, { zh: "袁家村", en: "Yuanjia Village" }] },
  { province: "陕西省", name: "渭南市", short: "渭南", en: "Weinan", landmarks: [
    { zh: "华山", en: "Mount Hua" }, { zh: "党家村", en: "Dangjia Village" }] },
  { province: "陕西省", name: "延安市", short: "延安", en: "Yan'an", landmarks: [
    { zh: "宝塔山", en: "Baota Hill" }, { zh: "黄帝陵", en: "Mausoleum of the Yellow Emperor" }] },
  { province: "陕西省", name: "汉中市", short: "汉中", en: "Hanzhong", landmarks: [
    { zh: "石门栈道", en: "Shimen Plank Road" }, { zh: "张良庙", en: "Zhang Liang Temple" }] },
  { province: "陕西省", name: "榆林市", short: "榆林", en: "Yulin Shaanxi", landmarks: [
    { zh: "镇北台", en: "Zhenbeitai" }, { zh: "红碱淖", en: "Hongjiannao" }] },
  { province: "陕西省", name: "安康市", short: "安康", en: "Ankang", landmarks: [
    { zh: "瀛湖", en: "Yinghu Lake" }, { zh: "香溪洞", en: "Xiangxi Cave" }] },
  { province: "陕西省", name: "商洛市", short: "商洛", en: "Shangluo", landmarks: [
    { zh: "金丝峡", en: "Jinsi Gorge" }, { zh: "牛背梁", en: "Niubeiliang" }] },
];

const gansu: readonly CatalogCity[] = [
  { province: "甘肃省", name: "兰州市", short: "兰州", en: "Lanzhou", landmarks: [
    { zh: "中山桥", en: "Zhongshan Bridge Lanzhou" }, { zh: "白塔山", en: "Baita Mountain" }] },
  { province: "甘肃省", name: "嘉峪关市", short: "嘉峪关", en: "Jiayuguan", landmarks: [
    { zh: "嘉峪关关城", en: "Jiayu Pass" }, { zh: "悬壁长城", en: "Overhanging Great Wall" }] },
  { province: "甘肃省", name: "金昌市", short: "金昌", en: "Jinchang", landmarks: [
    { zh: "骊靬古城", en: "Liqian Ancient City" }, { zh: "北海子", en: "Beihaizi Park" }] },
  { province: "甘肃省", name: "白银市", short: "白银", en: "Baiyin", landmarks: [
    { zh: "黄河石林", en: "Yellow River Stone Forest" }, { zh: "寿鹿山", en: "Shoulu Mountain" }] },
  { province: "甘肃省", name: "天水市", short: "天水", en: "Tianshui", landmarks: [
    { zh: "麦积山石窟", en: "Maijishan Grottoes" }, { zh: "伏羲庙", en: "Fuxi Temple" }] },
  { province: "甘肃省", name: "武威市", short: "武威", en: "Wuwei", landmarks: [
    { zh: "雷台汉墓", en: "Leitai Han Tomb" }, { zh: "武威文庙", en: "Wuwei Confucian Temple" }] },
  { province: "甘肃省", name: "张掖市", short: "张掖", en: "Zhangye", landmarks: [
    { zh: "七彩丹霞", en: "Zhangye Danxia" }, { zh: "马蹄寺", en: "Mati Temple" }] },
  { province: "甘肃省", name: "平凉市", short: "平凉", en: "Pingliang", landmarks: [
    { zh: "崆峒山", en: "Kongtong Mountain" }, { zh: "云崖寺", en: "Yunya Temple" }] },
  { province: "甘肃省", name: "庆阳市", short: "庆阳", en: "Qingyang Gansu", landmarks: [
    { zh: "周祖陵", en: "Zhouzu Mausoleum" }, { zh: "北石窟寺", en: "North Grotto Temple" }] },
  { province: "甘肃省", name: "定西市", short: "定西", en: "Dingxi", landmarks: [
    { zh: "渭河源", en: "Weihe Source" }, { zh: "贵清山", en: "Guiqing Mountain" }] },
  { province: "甘肃省", name: "陇南市", short: "陇南", en: "Longnan", landmarks: [
    { zh: "官鹅沟", en: "Guan'e Gully" }, { zh: "万象洞", en: "Wanxiang Cave" }] },
  { province: "甘肃省", name: "临夏回族自治州", short: "临夏", en: "Linxia", landmarks: [
    { zh: "炳灵寺", en: "Bingling Temple" }, { zh: "八坊十三巷", en: "Bafang Thirteen Lanes" }] },
  { province: "甘肃省", name: "甘南藏族自治州", short: "甘南", en: "Gannan", landmarks: [
    { zh: "拉卜楞寺", en: "Labrang Monastery" }, { zh: "扎尕那", en: "Zhagana" }] },
];

const ningxia: readonly CatalogCity[] = [
  { province: "宁夏回族自治区", name: "银川市", short: "银川", en: "Yinchuan", landmarks: [
    { zh: "西夏王陵", en: "Western Xia Tombs" }, { zh: "镇北堡西部影城", en: "Zhenbeibu Western Film Studio" }] },
  { province: "宁夏回族自治区", name: "石嘴山市", short: "石嘴山", en: "Shizuishan", landmarks: [
    { zh: "沙湖", en: "Sand Lake Ningxia" }, { zh: "北武当庙", en: "Beiwudang Temple" }] },
  { province: "宁夏回族自治区", name: "吴忠市", short: "吴忠", en: "Wuzhong", landmarks: [
    { zh: "一百零八塔", en: "108 Stupas" }, { zh: "青铜峡", en: "Qingtongxia" }] },
  { province: "宁夏回族自治区", name: "固原市", short: "固原", en: "Guyuan", landmarks: [
    { zh: "须弥山石窟", en: "Xumishan Grottoes" }, { zh: "六盘山", en: "Liupan Mountain" }] },
  { province: "宁夏回族自治区", name: "中卫市", short: "中卫", en: "Zhongwei", landmarks: [
    { zh: "沙坡头", en: "Shapotou" }, { zh: "高庙", en: "Gaomiao Zhongwei" }] },
];

const qinghai: readonly CatalogCity[] = [
  { province: "青海省", name: "西宁市", short: "西宁", en: "Xining", landmarks: [
    { zh: "塔尔寺", en: "Kumbum Monastery" }, { zh: "东关清真大寺", en: "Dongguan Mosque" }] },
  { province: "青海省", name: "海东市", short: "海东", en: "Haidong", landmarks: [
    { zh: "瞿昙寺", en: "Qutan Temple" }, { zh: "孟达天池", en: "Mengda Tianchi" }] },
  { province: "青海省", name: "黄南藏族自治州", short: "黄南", en: "Huangnan", landmarks: [
    { zh: "坎布拉", en: "Kanbula" }, { zh: "隆务寺", en: "Rongwo Monastery" }] },
  { province: "青海省", name: "果洛藏族自治州", short: "果洛", en: "Golog", landmarks: [
    { zh: "年保玉则", en: "Nyanbo Yurtse" }, { zh: "阿尼玛卿", en: "Amne Machin" }] },
  { province: "青海省", name: "玉树藏族自治州", short: "玉树", en: "Yushu", landmarks: [
    { zh: "结古寺", en: "Jyekundo Monastery" }, { zh: "勒巴沟", en: "Leba Valley" }] },
  { province: "青海省", name: "海西蒙古族藏族自治州", short: "海西", en: "Haixi", landmarks: [
    { zh: "茶卡盐湖", en: "Chaka Salt Lake" }, { zh: "察尔汗盐湖", en: "Qarhan Salt Lake" }] },
];

const xinjiang: readonly CatalogCity[] = [
  { province: "新疆维吾尔自治区", name: "乌鲁木齐市", short: "乌鲁木齐", en: "Urumqi", landmarks: [
    { zh: "红山公园", en: "Hongshan Park Urumqi" }, { zh: "天山大峡谷", en: "Tianshan Grand Canyon" }] },
  { province: "新疆维吾尔自治区", name: "克拉玛依市", short: "克拉玛依", en: "Karamay", landmarks: [
    { zh: "魔鬼城", en: "Urho Ghost City" }, { zh: "黑油山", en: "Heiyou Mountain" }] },
  { province: "新疆维吾尔自治区", name: "吐鲁番市", short: "吐鲁番", en: "Turpan", landmarks: [
    { zh: "火焰山", en: "Flaming Mountains" }, { zh: "交河故城", en: "Jiaohe Ruins" }] },
  { province: "新疆维吾尔自治区", name: "哈密市", short: "哈密", en: "Hami", landmarks: [
    { zh: "哈密回王府", en: "Hami King's Palace" }, { zh: "巴里坤草原", en: "Barkol Grassland" }] },
  { province: "新疆维吾尔自治区", name: "博尔塔拉蒙古自治州", short: "博尔塔拉", en: "Bortala", landmarks: [
    { zh: "赛里木湖", en: "Sayram Lake" }, { zh: "怪石峪", en: "Guaishiyu" }] },
  { province: "新疆维吾尔自治区", name: "巴音郭楞蒙古自治州", short: "巴音郭楞", en: "Bayingolin", landmarks: [
    { zh: "博斯腾湖", en: "Bosten Lake" }, { zh: "巴音布鲁克", en: "Bayanbulak" }] },
  { province: "新疆维吾尔自治区", name: "阿克苏地区", short: "阿克苏", en: "Aksu", landmarks: [
    { zh: "天山神秘大峡谷", en: "Tianshan Mysterious Canyon" }, { zh: "托木尔峰", en: "Jengish Chokusu" }] },
  { province: "新疆维吾尔自治区", name: "克孜勒苏柯尔克孜自治州", short: "克孜勒苏", en: "Kizilsu", landmarks: [
    { zh: "奥依塔克", en: "Oytagh Glacier" }, { zh: "阿图什天门", en: "Shipton's Arch" }] },
  { province: "新疆维吾尔自治区", name: "喀什地区", short: "喀什", en: "Kashgar", landmarks: [
    { zh: "艾提尕尔清真寺", en: "Id Kah Mosque" }, { zh: "喀什古城", en: "Kashgar Old City" }] },
  { province: "新疆维吾尔自治区", name: "和田地区", short: "和田", en: "Hotan", landmarks: [
    { zh: "玉龙喀什河", en: "Yurungkash River" }, { zh: "热瓦克佛寺", en: "Rawak Stupa" }] },
  { province: "新疆维吾尔自治区", name: "伊犁哈萨克自治州", short: "伊犁", en: "Ili", landmarks: [
    { zh: "那拉提", en: "Nalati" }, { zh: "喀拉峻", en: "Kalajun" }] },
  { province: "新疆维吾尔自治区", name: "塔城地区", short: "塔城", en: "Tacheng", landmarks: [
    { zh: "巴尔鲁克山", en: "Barluk Mountains" }, { zh: "塔城红楼", en: "Tacheng Red Building" }] },
];

const shandong: readonly CatalogCity[] = [
  { province: "山东省", name: "济南市", short: "济南", en: "Jinan", landmarks: [
    { zh: "趵突泉", en: "Baotu Spring" }, { zh: "大明湖", en: "Daming Lake" }] },
  { province: "山东省", name: "青岛市", short: "青岛", en: "Qingdao", landmarks: [
    { zh: "栈桥", en: "Zhanqiao Pier" }, { zh: "崂山", en: "Mount Lao" }] },
  { province: "山东省", name: "淄博市", short: "淄博", en: "Zibo", landmarks: [
    { zh: "周村古商城", en: "Zhoucun Ancient Commercial Town" }, { zh: "潭溪山", en: "Tanxi Mountain" }] },
  { province: "山东省", name: "枣庄市", short: "枣庄", en: "Zaozhuang", landmarks: [
    { zh: "台儿庄古城", en: "Tai'erzhuang Ancient Town" }, { zh: "抱犊崮", en: "Baodugu" }] },
  { province: "山东省", name: "东营市", short: "东营", en: "Dongying", landmarks: [
    { zh: "黄河入海口", en: "Yellow River Estuary" }, { zh: "天鹅湖", en: "Swan Lake Dongying" }] },
  { province: "山东省", name: "烟台市", short: "烟台", en: "Yantai", landmarks: [
    { zh: "蓬莱阁", en: "Penglai Pavilion" }, { zh: "养马岛", en: "Yangma Island" }] },
  { province: "山东省", name: "潍坊市", short: "潍坊", en: "Weifang", landmarks: [
    { zh: "十笏园", en: "Shihu Garden" }, { zh: "青州古城", en: "Qingzhou Ancient City" }] },
  { province: "山东省", name: "济宁市", short: "济宁", en: "Jining", landmarks: [
    { zh: "曲阜孔庙", en: "Temple of Confucius Qufu" }, { zh: "微山湖", en: "Weishan Lake" }] },
  { province: "山东省", name: "威海市", short: "威海", en: "Weihai", landmarks: [
    { zh: "刘公岛", en: "Liugong Island" }, { zh: "成山头", en: "Chengshantou" }] },
  { province: "山东省", name: "日照市", short: "日照", en: "Rizhao", landmarks: [
    { zh: "万平口", en: "Wanpingkou" }, { zh: "五莲山", en: "Wulian Mountain" }] },
  { province: "山东省", name: "临沂市", short: "临沂", en: "Linyi", landmarks: [
    { zh: "沂蒙山", en: "Yimeng Mountain" }, { zh: "竹泉村", en: "Zhuquan Village" }] },
  { province: "山东省", name: "德州市", short: "德州", en: "Dezhou", landmarks: [
    { zh: "董子园", en: "Dongzi Garden" }, { zh: "苏禄王墓", en: "Tomb of the Sultan of Sulu" }] },
  { province: "山东省", name: "聊城市", short: "聊城", en: "Liaocheng", landmarks: [
    { zh: "光岳楼", en: "Guangyue Tower" }, { zh: "东昌湖", en: "Dongchang Lake" }] },
  { province: "山东省", name: "滨州市", short: "滨州", en: "Binzhou", landmarks: [
    { zh: "魏氏庄园", en: "Wei Family Manor" }, { zh: "鹤伴山", en: "Heban Mountain" }] },
  { province: "山东省", name: "菏泽市", short: "菏泽", en: "Heze", landmarks: [
    { zh: "曹州牡丹园", en: "Caozhou Peony Garden" }, { zh: "水浒好汉城", en: "Water Margin Heroes City" }] },
];

const guizhou: readonly CatalogCity[] = [
  { province: "贵州省", name: "贵阳市", short: "贵阳", en: "Guiyang", landmarks: [
    { zh: "甲秀楼", en: "Jiaxiu Tower" }, { zh: "青岩古镇", en: "Qingyan Ancient Town" }] },
  { province: "贵州省", name: "六盘水市", short: "六盘水", en: "Liupanshui", landmarks: [
    { zh: "乌蒙大草原", en: "Wumeng Grassland" }, { zh: "妥乐古银杏", en: "Tuole Ginkgo Village" }] },
  { province: "贵州省", name: "遵义市", short: "遵义", en: "Zunyi", landmarks: [
    { zh: "遵义会议会址", en: "Zunyi Conference Site" }, { zh: "赤水丹霞", en: "Chishui Danxia" }] },
  { province: "贵州省", name: "安顺市", short: "安顺", en: "Anshun", landmarks: [
    { zh: "黄果树瀑布", en: "Huangguoshu Waterfall" }, { zh: "龙宫", en: "Dragon Palace Anshun" }] },
  { province: "贵州省", name: "毕节市", short: "毕节", en: "Bijie", landmarks: [
    { zh: "百里杜鹃", en: "Baili Rhododendron" }, { zh: "织金洞", en: "Zhijin Cave" }] },
  { province: "贵州省", name: "铜仁市", short: "铜仁", en: "Tongren", landmarks: [
    { zh: "梵净山", en: "Mount Fanjing" }, { zh: "苗王城", en: "Miao King City" }] },
  { province: "贵州省", name: "黔西南布依族苗族自治州", short: "黔西南", en: "Qianxinan", landmarks: [
    { zh: "万峰林", en: "Wanfenglin" }, { zh: "马岭河峡谷", en: "Maling River Canyon" }] },
  { province: "贵州省", name: "黔东南苗族侗族自治州", short: "黔东南", en: "Qiandongnan", landmarks: [
    { zh: "西江千户苗寨", en: "Xijiang Miao Village" }, { zh: "镇远古城", en: "Zhenyuan Ancient Town" }] },
  { province: "贵州省", name: "黔南布依族苗族自治州", short: "黔南", en: "Qiannan", landmarks: [
    { zh: "小七孔", en: "Xiaoqikong" }, { zh: "中国天眼", en: "FAST Telescope" }] },
];

export const catalogBatches: readonly CatalogBatch[] = [
  { id: "jiangzhehu", cities: [...jiangsu, ...zhejiang, ...shanghai] },
  { id: "southwest", cities: [...yunnan, ...sichuan, ...chongqing, ...tibet] },
  { id: "south", cities: [...guangdong, ...guangxi, ...hainan, ...fujian] },
  { id: "north", cities: [...tianjin, ...hebei, ...shanxi, ...innerMongolia] },
  { id: "central", cities: [...henan, ...hubei, ...hunan, ...jiangxi, ...anhui] },
  { id: "northeast", cities: [...liaoning, ...jilin, ...heilongjiang] },
  { id: "northwest", cities: [...shaanxi, ...gansu, ...ningxia, ...qinghai, ...xinjiang] },
  { id: "shandong-guizhou", cities: [...shandong, ...guizhou] },
];
