import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext'
import { getLogger } from '@napgram/infra-kit'

const logger = getLogger('HelpCommandHandler')

/**
 * 帮助命令处理器
 */
export class HelpCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, _args: string[]): Promise<void> {
    const commandList: string[] = []
    const processedCommands = new Set<string>()

    for (const [name, command] of this.context.registry.getAll()) {
      // 跳过别名
      if (name !== command.name)
        continue

      processedCommands.add(command.name)

      let line = `${this.context.registry.prefix}${command.name}`
      if (command.aliases && command.aliases.length > 0) {
        line += ` (${command.aliases.join(', ')})`
      }
      line += ` - ${command.description}`
      if (command.adminOnly) {
        line += ' [管理员]'
      }

      commandList.push(line)
    }

    const helpText = `可用命令:\n${commandList.join('\n')}`

    try {
      await this.context.replyBoth(msg, helpText, 'help')
    }
    catch (e) {
      logger.warn('发送帮助信息失败', e)
    }
    logger.info('Help command executed')
  }
}
