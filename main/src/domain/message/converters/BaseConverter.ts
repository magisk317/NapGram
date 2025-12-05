import { getLogger } from '../../../shared/utils/logger';

export abstract class BaseConverter {
    protected logger = getLogger(this.constructor.name);
}
