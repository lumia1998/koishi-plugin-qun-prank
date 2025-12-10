import { Context, Schema, h } from 'koishi'
import * as path from 'path'
import * as fs from 'fs'
import { pathToFileURL } from 'url'

export const name = 'qun-prank'

export const usage = `
# koishi-plugin-qun-fuck

Koishi 的银趴插件,复刻自 Yunzai-Bot 的 qun-fuck 插件。

## 📝 功能

- 透群友、透群主、透管理
- 查询自己或他人的被透记录
- 查看今日被透排行榜(图片形式)
- 每日自动清空数据
- 高度可配置(开关、冷却、数值、暴击、背景图等)

## 🎮 指令

- **\`fuck <target:user>\`**: 操群友。\`target\` 可以是 @某人 或 QQ 号。
- **\`fuckrank\`**: 查看今日银趴排行榜。
- **\`fuck.query [target:user]\`**: 查询自己或他人的被透记录。不加参数时查询自己。

`

export const inject = ['database', 'puppeteer']

export interface Config {
  enabled: boolean
  cooldown: number
  minRandom: number
  maxRandom: number
  critChance: number
  critMultiplier: number
  backgroundImages: string[]
  // New features from ccb-plus
  allowSelfFuck: boolean
  whitelist: string[]
  yangweiThreshold: number
  yangweiBanDuration: number
  yangweiProbability: number
  counterattackProbability: number
  drainedProbability: number
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用插件'),
  cooldown: Schema.number().default(30).description('透人冷却时间(秒)'),
  minRandom: Schema.number().default(1).description('注入量的最小随机数'),
  maxRandom: Schema.number().default(10).description('注入量的最大随机数'),
  critChance: Schema.number().min(0).max(100).default(10).description('暴击几率(%)'),
  critMultiplier: Schema.number().min(1).default(2).description('暴击倍率'),
  backgroundImages: Schema.array(String).role('table').description('排行榜背景图片。可以填写文件夹路径、图片文件的绝对路径、网络 URL 或包含多个 URL 的 .txt 文件路径。').default([
    path.join(__dirname, '..', 'assets', 'background.jpg')
  ]),
  // New configurations
  allowSelfFuck: Schema.boolean().default(false).description('是否允许自己透自己'),
  whitelist: Schema.array(String).default([]).description('白名单用户ID列表(这些用户不能被透)'),
  yangweiThreshold: Schema.number().default(3).description('1分钟内最大允许操作次数'),
  yangweiBanDuration: Schema.number().default(300).description('阳痿禁用时长(秒)'),
  yangweiProbability: Schema.number().min(0).max(1).default(0.1).description('炸膛触发概率(0-1)'),
  counterattackProbability: Schema.number().min(0).max(1).default(0.1).description('反击触发概率(0-1)'),
  drainedProbability: Schema.number().min(0).max(1).default(0.1).description('被榨干触发概率(0-1,仅暴击时)'),
})

declare module 'koishi' {
  interface Tables {
    qun_fuck_records: QunFuckRecord
    qun_fuck_stats: QunFuckStats
  }
}

export interface QunFuckRecord {
  id: number
  guildId: string
  userId: string
  userName: string
  targetId: string
  targetName: string
  amount: number
  timestamp: Date
}

export interface QunFuckStats {
  id: number
  guildId: string
  targetId: string
  targetName: string
  firstActorId: string
  firstActorName: string
  maxSingleAmount: number
  maxProducerId: string
  maxProducerName: string
  timestamp: Date
}

export function apply(ctx: Context, config: Config) {
  // Extend database with records table
  ctx.model.extend('qun_fuck_records', {
    id: 'unsigned',
    guildId: 'string',
    userId: 'string',
    userName: 'string',
    targetId: 'string',
    targetName: 'string',
    amount: 'double',
    timestamp: 'timestamp',
  }, {
    autoInc: true,
  })

  // Extend database with stats table for tracking first actor and max
  ctx.model.extend('qun_fuck_stats', {
    id: 'unsigned',
    guildId: 'string',
    targetId: 'string',
    targetName: 'string',
    firstActorId: 'string',
    firstActorName: 'string',
    maxSingleAmount: 'double',
    maxProducerId: 'string',
    maxProducerName: 'string',
    timestamp: 'timestamp',
  }, {
    autoInc: true,
  })

  // In-memory state for yangwei system
  const actionTimes = new Map<string, number[]>()
  const banList = new Map<string, number>()

  // Daily reset task
  ctx.on('ready', async () => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timeToTomorrow = tomorrow.getTime() - now.getTime()

    const resetDaily = async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      try {
        await ctx.database.remove('qun_fuck_records', { timestamp: { $lt: today } })
        await ctx.database.remove('qun_fuck_stats', { timestamp: { $lt: today } })
        ctx.logger.info('已清空昨日银趴数据')
      } catch (error) {
        ctx.logger.error('清空银趴数据时出错:', error)
      }
    }

    setTimeout(() => {
      resetDaily()
      setInterval(resetDaily, 24 * 60 * 60 * 1000)
    }, timeToTomorrow)
  })

  ctx.command('fuck [target]', '操群友')
    .action(async ({ session }) => {
      if (!session) return
      if (!session.guildId) return '只能在群聊中使用哦~'
      if (!config.enabled) return '本群银趴功能已关闭。'
      if (!session.userId || !session.username) return '无法获取用户信息。'

      const now = Date.now()
      const actorId = session.userId

      // Check ban status
      const banEnd = banList.get(actorId) || 0
      if (now < banEnd) {
        const remain = Math.ceil((banEnd - now) / 1000)
        const m = Math.floor(remain / 60)
        const s = remain % 60
        return `嘻嘻,你已经一滴不剩了,阳痿还剩 ${m}分${s}秒`
      }

      // Sliding window rate limiting (1 minute window)
      const times = actionTimes.get(actorId) || []
      const windowStart = now - 60 * 1000  // 60 seconds = 1 minute
      const recentTimes = times.filter(t => t > windowStart)
      recentTimes.push(now)
      actionTimes.set(actorId, recentTimes)

      // Check threshold
      if (recentTimes.length > config.yangweiThreshold) {
        banList.set(actorId, now + config.yangweiBanDuration * 1000)
        actionTimes.set(actorId, [])
        return '冲得出来吗你就冲,再冲就给你折了'
      }

      // Parse target
      const atElement = session.elements?.find(e => e.type === 'at')
      if (!atElement) {
        return '请 @ 你要透的人。'
      }

      const targetId = atElement.attrs.id
      let targetName = atElement.attrs.name

      if (!targetName) {
        try {
          const user = await session.bot.getUser(targetId)
          if (user && user.name) {
            targetName = user.name
          }
        } catch (error) {
          ctx.logger.warn(`[qun-prank] 无法获取用户 ${targetId} 的信息:`, error)
        }
      }

      if (!targetName) {
        targetName = targetId // Fallback to ID
      }

      // Check whitelist
      if (config.whitelist.includes(targetId)) {
        return `${targetName} 的后门已经装上了成都之心,不能透(悲`
      }

      // Check self-fuck
      if (session.userId === targetId && !config.allowSelfFuck) {
        return '不能对自己使用!'
      }

      // Check cooldown (per-user cooldown)
      const lastUsage = await ctx.database.get('qun_fuck_records', {
        guildId: session.guildId,
        userId: session.userId,
      }, {
        sort: { timestamp: 'desc' }
      })

      if (lastUsage.length > 0) {
        const diff = (new Date().getTime() - lastUsage[0].timestamp.getTime()) / 1000
        if (diff < config.cooldown) {
          return `冷却中,还需 ${Math.ceil(config.cooldown - diff)} 秒。`
        }
      }

      // Calculate amount
      const amount = config.minRandom + Math.random() * (config.maxRandom - config.minRandom)

      // Check drained probability first (被榨干) - this will force crit
      const isDrained = Math.random() < config.drainedProbability

      // If drained, force crit; otherwise normal crit check
      const isCrit = isDrained || (Math.random() * 100 < config.critChance)
      const finalAmount = isCrit ? amount * config.critMultiplier : amount

      // Check if self-fuck
      const isSelfFuck = session.userId === targetId

      // Check yangwei probability (炸膛) - before creating records
      if (Math.random() < config.yangweiProbability) {
        banList.set(actorId, now + config.yangweiBanDuration * 1000)
        if (isSelfFuck) {
          return '💥你的牛牛炸膛了!满身疮痍,再起不能(悲)'
        }
        return '💥你的牛牛炸膛了!满身疮痍,再起不能(悲)'
      }

      // Check counterattack probability (反击) - only for non-self-fuck
      if (!isSelfFuck && Math.random() < config.counterattackProbability) {
        banList.set(actorId, now + config.yangweiBanDuration * 1000)
        return '🚨你再看看你的后面呢？你的菊花惨遭突袭'
      }

      // Create record (only if not 炸膛)
      await ctx.database.create('qun_fuck_records', {
        guildId: session.guildId,
        userId: session.userId,
        userName: session.username,
        targetId: targetId,
        targetName: targetName,
        amount: finalAmount,
        timestamp: new Date(),
      })

      // Update or create stats
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const existingStats = await ctx.database.get('qun_fuck_stats', {
        guildId: session.guildId,
        targetId: targetId,
        timestamp: { $gte: today }
      })

      if (existingStats.length === 0) {
        // First time today - this is the 破壁人
        await ctx.database.create('qun_fuck_stats', {
          guildId: session.guildId,
          targetId: targetId,
          targetName: targetName,
          firstActorId: session.userId,
          firstActorName: session.username,
          maxSingleAmount: finalAmount,
          maxProducerId: session.userId,
          maxProducerName: session.username,
          timestamp: new Date(),
        })
      } else {
        // Update max if needed
        const stat = existingStats[0]
        if (finalAmount > stat.maxSingleAmount) {
          await ctx.database.set('qun_fuck_stats', { id: stat.id }, {
            maxSingleAmount: finalAmount,
            maxProducerId: session.userId,
            maxProducerName: session.username,
          })
        }
      }

      // Build message
      const message = h('message', [
        h.at(session.userId),
        ` 成功给 `,
        h.at(targetId),
        ` 注入了 ${finalAmount.toFixed(2)}mL!`
      ])

      let result: any
      if (isCrit) {
        result = h('message', [`✨暴击!✨ `, message])
      } else {
        result = message
      }

      // Check if drained (被榨干) - was determined earlier
      if (isDrained) {
        banList.set(actorId, now + config.yangweiBanDuration * 1000)
        return [result, '💀 你被榨干了！仿佛身体被掏空，买个腰子补补吧！']
      }

      // Self-fuck special message
      if (isSelfFuck) {
        return [result, '你牛子可真长还能自产自销啊']
      }

      return result
    })

  ctx.command('fuckrank', '查看今日银趴排行榜')
    .alias('fuck.rank')
    .action(async ({ session }) => {
      if (!session) return
      if (!session.guildId) return '只能在群聊中使用哦~'

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const records = await ctx.database.get('qun_fuck_records', {
        guildId: session.guildId,
        timestamp: { $gte: today }
      })

      if (records.length === 0) return '今天本群还没有人被透。'

      const stats = new Map<string, { name: string, amount: number, count: number }>()

      for (const record of records) {
        if (!stats.has(record.targetId)) {
          const initialName = record.targetName || record.targetId
          stats.set(record.targetId, { name: initialName, amount: 0, count: 0 })
        }
        const userStat = stats.get(record.targetId)
        if (userStat) {
          userStat.amount += record.amount
          userStat.count += 1
        }
      }

      const sortedStats = Array.from(stats.entries()).sort((a, b) => b[1].amount - a[1].amount)
      const top20Stats = sortedStats.slice(0, 20)

      const renderData = await Promise.all(top20Stats.map(async (item, index) => {
        const [userId, stat] = item
        let name = stat.name

        try {
          const user = await session.bot.getUser(userId)
          if (user && user.name) {
            name = user.name
          }
        } catch (error) {
          ctx.logger.warn(`[qun-prank] 无法获取用户 ${userId} 的信息,将使用数据库中的名称:`, error)
        }

        return {
          rank: index + 1,
          name: name || userId,
          amount: stat.amount.toFixed(2),
          count: stat.count,
          avatar: `https://q1.qlogo.cn/g?b=qq&s=160&nk=${userId.split(':').pop()}`
        }
      }))

      const imageUrl = getRandomBackground(config)

      const html = `
        <html>
          <head>
            <style>
              body {
                font-family: sans-serif;
                background-image: url(${imageUrl});
                background-size: cover;
                background-position: center;
                padding: 20px;
              }
              .container { background-color: rgba(255, 255, 255, 0.8); border-radius: 8px; padding: 20px; }
              h1 { text-align: center; color: #333; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
              .avatar { width: 40px; height: 40px; border-radius: 50%; vertical-align: middle; margin-right: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>今日银趴排行榜</h1>
              <table>
                <tr>
                  <th>排名</th>
                  <th>群友</th>
                  <th>被注入量 (mL)</th>
                  <th>次数</th>
                </tr>
                ${renderData.map(d => `
                  <tr>
                    <td>${d.rank}</td>
                    <td><img src="${d.avatar}" class="avatar">${d.name}</td>
                    <td>${d.amount}</td>
                    <td>${d.count}</td>
                  </tr>
                `).join('')}
              </table>
            </div>
          </body>
        </html>
      `

      return ctx.get('puppeteer').render(html)
    })

  function getRandomBackground(config: Config): string {
    const backgroundPath = config.backgroundImages[Math.floor(Math.random() * config.backgroundImages.length)]

    if (backgroundPath.startsWith('http://') || backgroundPath.startsWith('https://')) {
      return backgroundPath
    }

    const absolutePath = path.resolve(backgroundPath)

    if (fs.existsSync(absolutePath)) {
      if (fs.lstatSync(absolutePath).isDirectory()) {
        const files = fs.readdirSync(absolutePath).filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
        if (files.length > 0) {
          const randomFile = files[Math.floor(Math.random() * files.length)]
          return pathToFileURL(path.join(absolutePath, randomFile)).href
        }
      } else if (absolutePath.endsWith('.txt')) {
        const lines = fs.readFileSync(absolutePath, 'utf-8').split('\n').filter(Boolean)
        if (lines.length > 0) {
          return lines[Math.floor(Math.random() * lines.length)].trim()
        }
      } else if (/\.(jpg|png|gif|bmp|webp)$/i.test(absolutePath)) {
        return pathToFileURL(absolutePath).href
      }
    }

    // Fallback to default
    return pathToFileURL(path.join(__dirname, '..', 'assets', 'background.jpg')).href
  }

  ctx.command('fuckquery [target]', '查询自己或他人的被透记录')
    .alias('fuck.query')
    .action(async ({ session }) => {
      if (!session) return
      if (!session.guildId) return '只能在群聊中使用哦~'

      let targetId = session.userId
      let targetName = session.username

      const atElement = session.elements?.find(e => e.type === 'at')
      if (atElement) {
        targetId = atElement.attrs.id
        targetName = atElement.attrs.name || targetId
      }

      if (!targetId) return '无法确定查询目标。'

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const records = await ctx.database.get('qun_fuck_records', {
        guildId: session.guildId,
        targetId: targetId,
        timestamp: { $gte: today },
      })

      if (records.length === 0) {
        return (targetId === session.userId) ? '你今天还没有被透过!' : 'Ta今天还没有被透过!'
      }

      const totalAmount = records.reduce((sum, record) => sum + record.amount, 0)
      const totalCount = records.length

      // Get stats for 破壁人 and max
      const stats = await ctx.database.get('qun_fuck_stats', {
        guildId: session.guildId,
        targetId: targetId,
        timestamp: { $gte: today }
      })

      let extraInfo = ''
      if (stats.length > 0) {
        const stat = stats[0]
        extraInfo = `\n• 破壁人: ${stat.firstActorName}\n• 单次最大注入: ${stat.maxSingleAmount.toFixed(2)}mL (${stat.maxProducerName})`
      }

      return h('message', [
        h.at(targetId, { name: targetName }),
        ` 今天被透了 ${totalCount} 次,总注入量为 ${totalAmount.toFixed(2)} mL。${extraInfo}`
      ])
    })
}
