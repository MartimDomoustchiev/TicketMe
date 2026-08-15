import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src", "app", "icon.svg");

function pngIco(png: Buffer, size: number): Buffer {
  const directory = Buffer.alloc(22);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(1, 4);
  directory.writeUInt8(size >= 256 ? 0 : size, 6);
  directory.writeUInt8(size >= 256 ? 0 : size, 7);
  directory.writeUInt8(0, 8);
  directory.writeUInt8(0, 9);
  directory.writeUInt16LE(1, 10);
  directory.writeUInt16LE(32, 12);
  directory.writeUInt32LE(png.byteLength, 14);
  directory.writeUInt32LE(directory.byteLength, 18);
  return Buffer.concat([directory, png]);
}

async function main(): Promise<void> {
  const source = await readFile(sourcePath);
  const faviconPng = await sharp(source)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const appleIcon = await sharp(source)
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer();

  await Promise.all([
    writeFile(
      path.join(projectRoot, "src", "app", "favicon.ico"),
      pngIco(faviconPng, 64),
    ),
    writeFile(
      path.join(projectRoot, "src", "app", "apple-icon.png"),
      appleIcon,
    ),
    writeFile(
      path.join(projectRoot, "public", "favicon.png"),
      faviconPng,
    ),
  ]);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
