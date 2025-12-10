# koishi-plugin-qun-prank

Koishi 的银趴插件,复刻自 Yunzai-Bot 的 qun-fuck 插件。

## 📝 功能

### 核心功能
- 透群友、透群主、透管理
- 查询自己或他人的被透记录
- 查看今日被透排行榜(图片形式)
- 每日自动清空数据
- 高度可配置(开关、冷却、数值、暴击、背景图等)

### 🆕 v2.0 新增功能 (来自 ccb-plus)
- **阳痿系统**: 滑动窗口限流,防止频繁操作
  - 超过阈值自动进入禁用期
  - 随机触发"炸膛"效果
  - 随机触发"反击"效果
  - 随机触发"被榨干"效果(必定暴击)
- **白名单系统**: 特定用户不能被透
- **自透配置**: 可配置是否允许自己透自己
- **破壁人追踪**: 记录第一个透某用户的人
- **最大值追踪**: 记录单次最大注入量及其产生者

## 💿 安装

```bash
npm install koishi-plugin-qun-prank
```

然后在 `koishi.yml` 或控制台中启用插件。

**依赖服务:**

本插件需要以下服务才能完整运行:

- `database`: 用于存储数据。请安装并配置一个数据库插件,如 `koishi-plugin-database-sqlite`。
- `puppeteer`: 用于生成排行榜图片。请安装并配置 `koishi-plugin-puppeteer`。

## 🎮 指令

- **`fuck <target:user>`**: 透一个群友。`target` 可以是 @某人 或 QQ 号。
- **`fuckrank`** / **`fuck.rank`**: 查看今日银趴排行榜。
- **`fuckquery [target:user]`** / **`fuck.query`**: 查询自己或他人的被透记录。不加参数时查询自己。

## ⚙️ 配置

所有配置项都可以在 Koishi 控制台中进行修改。

### 基础配置
- **`enabled`**: 是否启用插件 (默认: `true`)
- **`cooldown`**: 透人冷却时间(秒) (默认: `30`)
- **`minRandom`**: 注入量的最小随机数 (默认: `1`)
- **`maxRandom`**: 注入量的最大随机数 (默认: `10`)
- **`critChance`**: 暴击几率(%) (默认: `10`)
- **`critMultiplier`**: 暴击倍率 (默认: `2`)
- **`backgroundImages`**: 排行榜背景图片的 URL 或路径数组

### 🆕 新增配置
- **`allowSelfFuck`**: 是否允许自己透自己 (默认: `false`)
- **`whitelist`**: 白名单用户ID列表,这些用户不能被透 (默认: `[]`)
- **`yangweiThreshold`**: 1分钟内最大允许操作次数 (默认: `3`)
- **`yangweiBanDuration`**: 阳痿禁用时长(秒) (默认: `300`)
- **`yangweiProbability`**: 炸膛触发概率(0-1) (默认: `0.1`)
- **`counterattackProbability`**: 反击触发概率(0-1) (默认: `0.1`)
- **`drainedProbability`**: 被榨干触发概率(0-1) (默认: `0.1`)

## 🎯 使用示例

### 基本使用
```
用户A: fuck @用户B
Bot: @用户A 成功给 @用户B 注入了 5.23mL!
```

### 暴击效果
```
用户A: fuck @用户B
Bot: ✨暴击!✨ @用户A 成功给 @用户B 注入了 10.46mL!
```

### 阳痿系统触发
```
用户A: fuck @用户B
用户A: fuck @用户C
用户A: fuck @用户D
用户A: fuck @用户E
Bot: 冲得出来吗你就冲,再冲就给你折了
```

### 炸膛效果
```
用户A: fuck @用户B
Bot: 💥你的牛牛炸膛了!满身疮痍,再起不能(悲)
```

### 反击效果
```
用户A: fuck @用户B
Bot: 🚨你再看看你的后面呢？菊花惨遭突袭，浑身酥麻无法动弹！
```

### 被榨干效果
```
用户A: fuck @用户B
Bot: ✨暴击!✨ @用户A 成功给 @用户B 注入了 10.46mL!
     💀 你被榨干了！仿佛身体被吸尘器掏空，买个腰子补补吧！
```

### 查询记录
```
用户A: fuckquery @用户B
Bot: @用户B 今天被透了 5 次,总注入量为 32.15 mL。
     • 破壁人: 用户C
     • 单次最大注入: 10.46mL (用户D)
```

### 白名单保护
```
用户A: fuck @管理员
Bot: 管理员 的后门被后户之神霸占了,不能透(悲
```

## 📊 数据说明

插件使用两个数据表:
- `qun_fuck_records`: 存储每次透人的详细记录
- `qun_fuck_stats`: 存储每个用户的统计信息(破壁人、最大值等)

数据每日0点自动清空,保持竞争新鲜感。

## 🔧 开发

```bash
# 克隆仓库
git clone <your-repo-url>

# 安装依赖
npm install

# 构建
npm run build
```

## 📄 License

MIT License © 2024