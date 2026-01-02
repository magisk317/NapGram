import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('CommandRegistry')

export interface Command {
  name: string
  aliases?: string[]
  description: string
  usage?: string
  handler: (msg: any, args: string[]) => Promise<void>
  adminOnly?: boolean
}

/**
 * 命令注册管理器
 */
export class CommandRegistry {
  private commands = new Map<string, Command>()
  private readonly commandPrefix = '/'

  /**
   * 注册命令
   */
  register(command: Command) {
    this.commands.set(command.name, command)

    // 注册别名
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command)
      }
    }

    logger.debug(`Registered command: ${command.name}`)
  }

  /**
   * 获取命令
   */
  get(commandName: string): Command | undefined {
    return this.commands.get(commandName)
  }

  /**
   * 获取所有命令
   */
  getAll(): Map<string, Command> {
    return this.commands
  }

  /**
   * 计算不含别名的命令数量
   */
  getUniqueCommandCount(): number {
    return new Set(this.commands.values()).size
  }

  /**
   * 清空所有命令
   */
  clear() {
    this.commands.clear()
  }

  get prefix(): string {
    return this.commandPrefix
  }
}
