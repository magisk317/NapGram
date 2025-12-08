import { spawn } from 'child_process';
import env from '../../../domain/models/env';

export default function tgsToGif(tgsPath: string, outputPath?: string) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (outputPath) {
      args.push('--output', outputPath);
    }
    args.push(tgsPath);

    const proc = spawn('bash', [env.TGS_TO_GIF, ...args]);
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve(outputPath ?? (tgsPath + '.gif'));
      }
      else {
        reject(new Error(`tgs_to_gif exited with code ${code}`));
      }
    });
  });
}
