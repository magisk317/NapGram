import { getLogger } from '../../../../main/src/shared/logger'

export abstract class BaseConverter {
  protected logger = getLogger(this.constructor.name)
}
