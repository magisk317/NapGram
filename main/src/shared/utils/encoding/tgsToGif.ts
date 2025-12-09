// @ts-ignore - tgs-to doesn't have proper TypeScript types
import TGS from 'tgs-to';

export default async function tgsToGif(tgsPath: string, outputPath?: string): Promise<string> {
  const outPath = outputPath || `${tgsPath}.gif`;

  // tgs-to uses class constructor pattern
  const tgs = new TGS(tgsPath);
  await tgs.convertToGif(outPath);

  return outPath;
}
