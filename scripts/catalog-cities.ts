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

export const catalogBatches: readonly CatalogBatch[] = [
  { id: "jiangzhehu", cities: [...jiangsu, ...zhejiang, ...shanghai] },
  { id: "southwest", cities: [...yunnan, ...sichuan, ...chongqing, ...tibet] },
  { id: "south", cities: [...guangdong, ...guangxi, ...hainan, ...fujian] },
];
