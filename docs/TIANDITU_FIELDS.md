# 天地图接口字段说明（Meri 实际使用的部分）

核对日期：**2026-10-23**。本文只记录 Meri 真正会发的请求、真实抓到的返回、每个字段的意思，以及踩过的坑。样本是当天用真实 key 抓的（截断到前 2 条 POI），不是文档抄来的。

配置：`MAP_PROVIDER=tianditu` + `TIANDITU_API_KEY`。适配器在 `src/platform/tianditu/`，请求客户端在 `tianditu-fetch.ts`（排队 ≥300ms、超时、418/429 处理、key 只拼进天地图地址）。

## 1. Meri 会发的四种请求

| # | 接口 | 用途 | 代码位置 |
|---|---|---|---|
| ① | `GET /v2/search` `queryType=1` | 普通搜索：关键词 → POI 列表 **或** 行政区 | `tianditu-location-provider.ts` |
| ② | `GET /v2/search` `queryType=13` | 分类搜索：某行政区里的 `风景名胜` + `山` | 同上 |
| ③ | `GET /v2/search` `queryType=4` | 输入联想（搜索框下拉） | `tianditu-input-tips-provider.ts` |
| ④ | `GET /geocoder` | 逆地理编码：坐标 → 省/市/区县 | `tianditu-location-provider.ts` |

固定常量：`pageSize = "30"`（普通搜索条数）、`resultLimit = 5`（返回给上层的候选数）、`chinaBound = "73,3,136,54"`、`sightDataTypes = ["风景名胜", "山"]`、`maxAreas = 2`。

## 2. POI 对象（①②③共用）

真实样本（`queryType=1`，`keyWord=夫子庙`）：

```json
{
  "name": "夫子庙",
  "address": "江苏省宿迁市泗阳县三庄镇夫子庙",
  "lonlat": "118.63425,33.844949",
  "province": "江苏省", "provinceCode": "156320000",
  "city": "宿迁市",     "cityCode": "156321300",
  "county": "泗阳县",   "countyCode": "156321323",
  "typeCode": "260112", "typeName": "自然村",
  "poiType": "101", "source": "0",
  "hotPointID": "D971C9136030879F",
  "phone": "", "eaddress": "", "ename": ""
}
```

| 字段 | 含义 | Meri 的用法 |
|---|---|---|
| `name` | 地物名称 | 与用户原话比对、排序（`namedFirst`：原话 > 景区后缀 > 最短前缀 > 设施最后） |
| `address` | 完整地址 | 只作卡片补充信息 |
| `lonlat` | `"经度,纬度"` 字符串 | 解析为坐标，坐标系 **CGCS2000**（绝不与 GCJ-02 互转） |
| `province` / `city` / `county` | 三级行政区名 | 拼成「省 / 市 / 区县」；判断同名地点是否在旅程范围内 |
| `provinceCode` / `cityCode` / `countyCode` | 9 位 GB 码，前缀 `156` = 中国 | 判断层级（`endsWith("0000")` = 省级，此时不调逆地理编码） |
| `typeCode` | 国标分类码（6 位） | 决定 `kind`：`/^(180400\|1602\|2602)/` 或 `180303/180304/180305/180307/180308/180309/180310` → `sight`，其余 `other` |
| `typeName` | 分类中文名 | 未使用（排查问题用） |
| `poiType` | `101` 普通 POI、`102` 公交站点 | 未使用 |
| `hotPointID` | 内部唯一 ID | 去重、作为候选的 `providerId` |
| `source` | 数据来源编号 | 未使用 |
| `phone` / `eaddress` / `ename` | 电话 / 英文地址 / 英文名 | 实测基本为空，未使用 |

**没有的字段**：没有热度、没有评分、没有景区等级（5A/4A）、没有"景区本体 vs 内部设施"的标记。要区分只能看名字。

## 3. ① 普通搜索 `queryType=1`

请求：

```json
{ "keyWord": "夫子庙", "queryType": "1", "start": "0", "count": "30",
  "level": "12", "mapBound": "73,3,136,54", "show": "2" }
```

| 参数 | 说明 |
|---|---|
| `keyWord` | 搜索词（必填） |
| `queryType` | `1` 普通搜索（含地铁公交）、`7` 地名搜索（Meri 不用；实测"大连"返回 18 万条政府机关，不适合选景点） |
| `start` / `count` | 分页，`0–300` |
| `level` | 地图缩放级别 1–18（必填） |
| `mapBound` | 视野范围 `minx,miny,maxx,maxy`（必填） |
| `show` | `1` 基本字段、`2` 详细字段（Meri 固定 `2`） |

### 3.1 返回形态 A：POI 列表（`resultType: 1`）

```json
{
  "resultType": 1,
  "count": 1,
  "keyWord": "夫子庙",
  "pois": [ { ...POI... } ],
  "lineData": [],
  "prompt": [ { "type": 4, "admins": [ { "adminName": "泗阳县", "adminCode": 156321323 } ] } ],
  "status": { "infocode": 1000, "cndesc": "服务正常" }
}
```

| 字段 | 含义 | 用法 |
|---|---|---|
| `count` | 匹配总数 | 只用于判断是否被 `count` 截断 |
| `pois` | POI 数组 | 主数据 |
| `lineData` | 公交线路（`poiType=102` 时） | 未使用 |
| `prompt` | 提示"是不是在 XX 搜 YY"，`type 1/2/3/4` | **未使用，也不该用**：实测搜"西湖"它提示"西湖区"，会把用户往行政区带 |
| `status.infocode` | `1000` 成功、`3001` 无数据、其它为错误 | 非 `1000` 一律当失败 |

### 3.2 返回形态 B：行政区（`resultType: 3`）

```json
{
  "resultType": 3,
  "count": 1,
  "area": {
    "name": "成都市", "adminCode": 156510100,
    "lonlat": "104.062269,30.661123",
    "level": "11",
    "bound": "102.989623,30.090958,104.89631,31.437786"
  },
  "status": { "infocode": 1000 }
}
```

| 字段 | 含义 | 用法 |
|---|---|---|
| `area.name` / `adminCode` | 行政区名 / GB 码 | 作为候选；`adminCode` 以 `0000` 结尾说明是省级 |
| `area.lonlat` | 中心点 | 拿去调 `/geocoder` 补省市 |
| `area.level` | 行政区级别（`11` = 地级市） | 未使用 |
| `area.bound` | 边界外框 | 未使用 |

## 4. ② 分类搜索 `queryType=13`

请求：

```json
{ "queryType": "13", "specify": "大理白族自治州", "dataTypes": "风景名胜,山",
  "start": "0", "count": "300", "mapBound": "73,3,136,54", "show": "2" }
```

| 参数 | 说明 |
|---|---|
| `specify` | 行政区：9 位 GB 码 **或中文名**（实测中文名可用） |
| `dataTypes` | 分类名或分类码，**多个用英文逗号** |

返回**按分类名分组**：

```json
{
  "风景名胜": {
    "count": 1395,
    "pois": [ { ...POI... } ],
    "resultType": 1,
    "lineData": [],
    "status": { "infocode": 1000, "cndesc": "服务正常" }
  },
  "山": { "count": 2209, "pois": [ ... ], "status": { "infocode": 1000 } }
}
```

| 字段 | 含义 | 用法 |
|---|---|---|
| 顶层键 = 分类名 | 每个分类一个对象 | 按请求的 `dataTypes` 取 |
| `count` | 该分类总条数 | 判断是否超过 300 条上限 |
| `pois` | 该分类的 POI | 按名字匹配用户原话 |
| `status.infocode` | 每个分类**独立** | `1000` 用、`3001` 当空、其它当失败 |

单分类请求时（`dataTypes=风景名胜`）返回的是**顶层 `pois`**，没有分组——两种形状都要兼容。

## 5. ③ 输入联想 `queryType=4`

请求：

```json
{ "keyWord": "大理", "queryType": "4", "start": "0", "count": "10", "level": "12", "mapBound": "73,3,136,54" }
```

返回（`suggests`，**没有 pois、没有 status**）：

```json
{
  "resultType": "4",
  "suggestsKey": "大理",
  "count": 10,
  "suggests": [
    { "name": "大理", "gbCode": "156330803", "address": "浙江省衢州市衢江区", "lonlat": "119.030338,29.152605" },
    { "name": "大理白族自治州", "gbCode": "156532901", "address": "云南省大理白族自治州大理市", "lonlat": "100.26652,25.60949" },
    { "name": "大理市政府", "gbCode": "156532901", "address": "...", "lonlat": "..." }
  ]
}
```

| 字段 | 含义 | 用法 |
|---|---|---|
| `name` | 建议词 | 显示；`preferredSuggestions` 把政府机构排后、按长度差排序 |
| `gbCode` | 所属行政区 GB 码 | 未使用（**会重复**，多个建议共享同一个码） |
| `address` | 所在位置 | 显示 |
| `lonlat` | 中心点 | 未使用（联想结果不能直接当目的地） |
| `resultType` | 固定字符串 `"4"` | 忽略 |

**已知噪声**：天地图把政府机构（`大理白族自治州政府`、`大理市政府`、`大理镇政府`）和同名村子（衢江区的"大理"）都当建议词。过滤规则在 `tianditu-input-tips-provider.ts`。

## 6. ④ 逆地理编码 `/geocoder`

请求：`{ "lon": 100.225258, "lat": 26.8583, "ver": 1 }`

返回：

```json
{
  "status": "0",
  "msg": "ok",
  "result": {
    "formatted_address": "云南省丽江市古城区祥和街道太和社区",
    "location": { "lon": 100.225258, "lat": 26.8583 },
    "addressComponent": {
      "nation": "中国",
      "province": "云南省", "province_code": "156530000",
      "city": "丽江市",     "city_code": "156530700",
      "county": "古城区",   "county_code": "156530702",
      "town": "祥和街道",   "town_code": "156530702003",
      "road": "玉雪大道",   "road_distance": 156,
      "poi": "丽江市",      "poi_position": "西南", "poi_distance": 4,
      "address": "云南省古城区祥和街道太和社区",
      "address_position": "西南", "address_distance": 4
    }
  }
}
```

| 字段 | 含义 | 用法 |
|---|---|---|
| `status` / `msg` | **`"0"` / `"ok"` 表示成功**（与搜索接口的 `infocode: 1000` 不是一套） | 不直接判断 |
| `addressComponent.province/city/county` | 三级行政区 | 主用：给行政区候选补省市 |
| `town` / `road` | 街道 / 道路 | 未使用 |
| 各种 `*_distance` | 距离（米） | 未使用 |
| `formatted_address` | 完整地址 | 未使用 |

**`addressComponent` 缺失 = 故障**，不是"这个地方没有省份"：没有省份的地点会让后续所有同名判断失效。

## 7. 踩过的坑（都是实测，别再试）

| 结论 | 证据 |
|---|---|
| **`dataTypes` 多值是支持的**，但返回**按分类名分组**，顶层没有 `pois` | 请求 `风景名胜,山` 返回 `{"风景名胜":{...},"山":{...}}`；`count=300` 时两类共 600 行且不报错 |
| 曾经误判为"多值返回 0 条" | 只读顶层 `pois` 所以看起来是空 |
| **`mapBound` 必填但不参与过滤** | 大理市 `风景名胜` 传全国框/市区框/极小框，总数都是 590 |
| **`start` 上限 300**，`start=600` 直接 HTTP 400；单次最多 600 行 | 县级大多够用（大理市 590、玉龙县 605 已贴边） |
| **429 是 QPS 限流** | 连发 6 次第 5、6 次 429，8 秒后恢复；客户端整队暂停 1 秒并重试（≤3 次） |
| **418 是防火墙拒绝** | 返回"访问被拦截！"HTML 页；不重试，`TiandituFailure = "refused"` |
| **`queryType=7` 不适合选景点** | 搜"大连"返回 185,677 条，前几条是市政府、市委、仲裁委 |
| **`prompt` 不能用来消歧** | 搜"西湖"提示"西湖区"，与用户想要的湖不一致 |
| **`ename` 全空** | 大理市 山 212 条、稻城县 风景名胜 40 条、黄山区 风景名胜 290 条，`ename` 均为空 |

## 8. 相关代码与文档

- 适配器：`src/platform/tianditu/tianditu-location-provider.ts`
- 请求客户端：`src/platform/tianditu/tianditu-fetch.ts`（排队、超时、418/429）
- 输入联想：`src/platform/tianditu/tianditu-input-tips-provider.ts`
- 分类页缓存：`src/platform/tianditu/classification-memory.ts`（`.cache/tianditu-classification.json`，7 天 / 200 页）
- 地点核验规则：`src/domain/location/destination-resolution-policy.ts`、`src/domain/location/place-name.ts`
- 实时核对脚本：`npx tsx scripts/verify-tianditu-coverage.ts`（20 个说法，带先验对比）
- 历史决策与已证伪的猜想：`docs/TODO.md`
