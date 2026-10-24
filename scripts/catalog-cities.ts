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

export const catalogBatches: readonly CatalogBatch[] = [
  { id: "jiangzhehu", cities: [...jiangsu, ...zhejiang, ...shanghai] },
  { id: "southwest", cities: [...yunnan, ...sichuan, ...chongqing, ...tibet] },
  { id: "south", cities: [...guangdong, ...guangxi, ...hainan, ...fujian] },
  { id: "north", cities: [...tianjin, ...hebei, ...shanxi, ...innerMongolia] },
  { id: "central", cities: [...henan, ...hubei, ...hunan, ...jiangxi, ...anhui] },
];
