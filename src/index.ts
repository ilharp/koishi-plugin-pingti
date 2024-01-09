import { Context, Schema } from 'koishi'

export const name = 'pingti'

export const inject = {
  optional: ['database'],
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface Config {
  headers: {
    key: string
    value: string
  }[]
}

export const Config: Schema<Config> = Schema.object({
  headers: Schema.array(
    Schema.object({
      key: Schema.string(),
      value: Schema.string(),
    }),
  )
    .default([])
    .role('table'),
})

declare module 'koishi' {
  interface Tables {
    pingti: PingTi
  }
}

export interface PingTi {
  key: string
  value: string
}

export function apply(ctx: Context, config: Config) {
  const l = ctx.logger('pingti')

  let task = Promise.resolve() as Promise<unknown>
  let i = 0

  const headers = config.headers.reduce((c, x) => ((c[x.key] = x.value), c), {})

  ctx.model.extend(
    'pingti',
    {
      key: {
        type: 'string',
        length: 255,
        nullable: false,
      },
      value: {
        type: 'string',
        length: 255,
        nullable: false,
      },
    },
    {
      primary: 'key',
      unique: [['key']],
    },
  )

  ctx.command('pingti [商品:text]').action(async ({ session }, key) => {
    if (!key) return session.execute('help pingti')

    if (key.length > 15)
      return '输入的商品名称太长啦，换一个短一点的商品试试吧~\n如：平替 猫窝'

    void session.send(`正在寻找平替……`)

    await sleep(1000)

    try {
      const cached = await ctx.database.get('pingti', key, ['value'])
      if (cached.length) return `${key} 的平替是：${cached[0].value}`

      const t = task.then(async () => {
        i++
        l.info(`队列上有 ${i} 个项`)

        try {
          const result = await ctx.http.post(
            'https://www.pingti.xyz/api/chat',
            JSON.stringify({
              messages: [
                {
                  role: 'user',
                  content: key,
                },
              ],
            }),
            {
              headers,
            },
          )

          i--
          l.info(`队列上有 ${i} 个项`)

          return result
        } catch (e) {
          return e as Error
        }
      })

      task = t.then(() => sleep(2000))

      const result = (await t).toString('utf8')
      if (result instanceof Error) throw result

      void ctx.database
        .upsert('pingti', [
          {
            key,
            value: result,
          },
        ])
        .catch((e) => {
          l.error('写入数据库时出现错误：')
          l.error(e)
        })

      return `${key} 的平替是：${result}`
    } catch (e) {
      l.error('处理时出现错误：')
      l.error(e)
      return '出现了问题 >_<……请稍后再试吧'
    }
  })
}
