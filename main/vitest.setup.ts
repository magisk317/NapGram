import fs from 'node:fs'
import path from 'node:path'
import { beforeAll } from 'vitest'

// 在测试开始前确保所有需要的目录存在
beforeAll(() => {
  const dataDir = process.env.DATA_DIR || path.resolve('./data')
  const dirs = [
    path.join(dataDir, 'temp'),
    path.join(dataDir, 'cache'),
    path.join(dataDir, 'logs'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
})
