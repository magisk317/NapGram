import { KoishiHost } from '../koishi/KoishiHost';

export class PluginRuntime {
  static async reload(options?: { defaultInstances?: number[] }) {
    return await KoishiHost.reload(options);
  }

  static getLastReport() {
    return KoishiHost.getLastReport();
  }
}

