import lottie2gif from '@lottie2img/main';
import fs from 'fs/promises';

export default async function tgsToGif(tgsPath: string, outputPath?: string): Promise<string> {
  const outPath = outputPath || `${tgsPath}.gif`;

  // Read TGS file (gzipped Lottie JSON)
  const tgsBuffer = await fs.readFile(tgsPath);

  // lottie2gif uses pure WASM, no Chromium needed!
  const gifBuffer = await lottie2gif(tgsBuffer);

  // Write output GIF
  await fs.writeFile(outPath, gifBuffer);

  return outPath;
}
