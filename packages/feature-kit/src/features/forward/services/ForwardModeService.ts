import type { ForwardMode, NicknameMode } from '../types'
import { env } from '@napgram/infra-kit'

/**
 * 转发模式管理服务
 * 负责管理昵称显示模式和转发开关
 */
export class ForwardModeService {
  public nicknameMode: NicknameMode
  public forwardMode: ForwardMode

  constructor() {
    this.nicknameMode = env.SHOW_NICKNAME_MODE as NicknameMode
    this.forwardMode = env.FORWARD_MODE as ForwardMode
  }

  /**
   * 检查是否应该显示 QQ -> TG 的昵称
   */
  shouldShowQQToTGNickname(): boolean {
    return this.nicknameMode[0] === '1'
  }

  /**
   * 检查是否应该显示 TG -> QQ 的昵称
   */
  shouldShowTGToQQNickname(): boolean {
    return this.nicknameMode[1] === '1'
  }

  /**
   * 检查是否启用 QQ -> TG 转发
   */
  isQQToTGEnabled(): boolean {
    return this.forwardMode[0] === '1'
  }

  /**
   * 检查是否启用 TG -> QQ 转发
   */
  isTGToQQEnabled(): boolean {
    return this.forwardMode[1] === '1'
  }

  /**
   * 更新昵称显示模式
   */
  setNicknameMode(mode: NicknameMode): void {
    this.nicknameMode = mode
  }

  /**
   * 更新转发模式
   */
  setForwardMode(mode: ForwardMode): void {
    this.forwardMode = mode
  }
}
