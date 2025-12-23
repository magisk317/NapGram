import { getLogger } from '../../../shared/logger'

export abstract class BaseConverter {
  protected logger = getLogger(this.constructor.name)
}
