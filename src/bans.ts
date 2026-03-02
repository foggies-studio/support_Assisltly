import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const BANS_PATH = path.join(DATA_DIR, "bans.json");

type BansFile = number[];

async function ensureStorage(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(BANS_PATH);
  } catch {
    await fs.writeFile(BANS_PATH, "[]\n", "utf-8");
  }
}

async function readBansRaw(): Promise<BansFile> {
  await ensureStorage();
  try {
    const raw = await fs.readFile(BANS_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
}

async function writeBansRaw(values: number[]): Promise<void> {
  const uniqueSorted = [...new Set(values)].sort((a, b) => a - b);
  await fs.writeFile(BANS_PATH, `${JSON.stringify(uniqueSorted, null, 2)}\n`, "utf-8");
}

export async function getBans(): Promise<Set<number>> {
  const values = await readBansRaw();
  return new Set(values);
}

export async function isBanned(userId: number): Promise<boolean> {
  const bans = await getBans();
  return bans.has(userId);
}

export async function addBan(userId: number): Promise<void> {
  const bans = await readBansRaw();
  if (!bans.includes(userId)) {
    bans.push(userId);
    await writeBansRaw(bans);
  }
}

export async function removeBan(userId: number): Promise<void> {
  const bans = await readBansRaw();
  const next = bans.filter((id) => id !== userId);
  await writeBansRaw(next);
}

export async function ensureBansFile(): Promise<void> {
  await ensureStorage();
}
