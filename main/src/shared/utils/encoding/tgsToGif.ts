import Lottie2img from '@lottie2img/main';
import fs from 'fs/promises';

export default async function tgsToGif(tgsPath: string, outputPath?: string): Promise<string> {
  const outPath = outputPath || `${tgsPath}.gif`;

  // Read TGS file (gzipped Lottie JSON)
  const tgsBuffer = await fs.readFile(tgsPath);

  // Instantiate the converter class
  const converter = new Lottie2img();

  // Convert to GIF using pure WASM (no Chromium!)
  const gifBuffer = await converter.toGIF(tgsBuffer);

  // Write output GIF
  await fs.writeFile(outPath, gifBuffer);

  return outPath;
}
