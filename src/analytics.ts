import path from 'path';
import type {
  AnalysisResult,
  CommitTypeStat,
  HeatmapCell,
  DailyActivity,
  TopFile,
} from './types';
import { AnalysisError } from './types';
import { EXT_TO_LANG, LANG_COLORS, HEATMAP_THRESHOLDS, SESSION_GAP_MS, COMMIT_TYPES_DEFS } from './constants';
import {
  isGitRepo,
  getCurrentBranch,
  parseGitLog,
  getFileFrequencies,
  getRecentLog,
} from './git';
import { scanDirectory, buildLanguageStats, type ScanProgress } from './scanner';

export type AnalysisProgressCallback = (
  step: string,
  percent: number
) => void;

/**
 * Fungsi utama: analisis satu repositori.
 * Mengembalikan AnalysisResult lengkap atau melempar AnalysisError.
 */
export async function analyzeRepository(
  repoPath: string,
  onProgress?: AnalysisProgressCallback
): Promise<AnalysisResult> {
  onProgress?.('Memverifikasi repositori...', 5);

  if (!isGitRepo(repoPath)) {
    throw new AnalysisError(
      `"${repoPath}" bukan repositori git yang valid. Pastikan folder berisi .git`,
      'NOT_GIT_REPO'
    );
  }

  const repoName = path.basename(repoPath);
  const branch = getCurrentBranch(repoPath);

  await sleep(100);

  onProgress?.('Membaca git history...', 15);
  const { commits, timestamps, messages, dailyAdded } = parseGitLog(repoPath);

  if (commits.length === 0) {
    throw new AnalysisError(
      'Repositori tidak memiliki commit apapun.',
      'GIT_LOG_FAILED'
    );
  }

  onProgress?.('Menganalisis commit messages...', 30);
  await sleep(50);

  onProgress?.('Menghitung frekuensi file...', 40);
  const fileFreqs = getFileFrequencies(repoPath, 8);
  await sleep(50);

  onProgress?.('Mengkategorikan commit types...', 50);
  const commitTypes = parseCommitTypes(messages);
  await sleep(50);

  onProgress?.('Scanning file sistem...', 55);
  const { langData, fileLines, totalFiles, totalLines } = scanDirectory(
    repoPath,
    (progress: ScanProgress) => {
      const pct = 55 + Math.min(progress.scannedFiles / 50, 30);
      onProgress?.(
        `Scanning file... (${progress.scannedFiles} file)`,
        Math.round(pct)
      );
    }
  );

  // ── Step 6: Agregasi metrik ──
  onProgress?.('Mengagregasi data...', 88);
  const hours = estimateCodingHours(timestamps);
  const streak = calculateStreak(dailyAdded);
  const hourlyPattern = buildHourlyPattern(timestamps);
  const heatmap = buildHeatmap(dailyAdded);
  const recentLog = getRecentLog(repoPath);

  const topFiles: TopFile[] = fileFreqs.map(f => {
    const ext = getExtension(f.path);
    const langName = EXT_TO_LANG[ext] || 'Lainnya';
    return {
      path: f.path,
      edits: f.edits,
      lines: fileLines[f.path] || 0,
      lang: ext,
      langName,
    };
  });

  const dailyActivity = buildDailyActivity(dailyAdded, 90);
  const languages = buildLanguageStats(langData);

  onProgress?.('Selesai!', 100);
  await sleep(300);

  return {
    repo: { name: repoName, path: repoPath, branch },
    stats: {
      lines: totalLines,
      files: totalFiles,
      hours,
      commits: commits.length,
    },
    languages,
    heatmap,
    dailyActivity,
    hourlyPattern,
    topFiles,
    commitTypes,
    recentLog,
    streak,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return '';
  return filePath.slice(dotIdx + 1).toLowerCase();
}

/**
 * Estimasi jam coding dari timestamps commit.
 * Deteksi "session" berdasarkan gap > 2 jam antar commit.
 */
function estimateCodingHours(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  if (timestamps.length === 1) return 1;

  const sorted = [...timestamps].sort((a, b) => a - b);
  let totalMinutes = 0;
  let sessionStart = sorted[0];
  let last = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - last > SESSION_GAP_MS) {
      totalMinutes += (last - sessionStart) / 60_000;
      sessionStart = sorted[i];
    }
    last = sorted[i];
  }

  totalMinutes += (last - sessionStart) / 60_000;

  return Math.max(1, Math.round(totalMinutes / 60));
}

/**
 * Hitung streak: hari berturut-turut dengan commit,
 * mundur dari hari ini (atau kemarin jika hari ini belum commit).
 */
function calculateStreak(dailyAdded: Record<string, number>): number {
  let streak = 0;
  const d = new Date();
  const todayKey = d.toISOString().slice(0, 10);

  if (!dailyAdded[todayKey]) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (dailyAdded[key]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Bangun heatmap 365 hari.
 * Level 0-5 berdasarkan threshold baris yang ditambahkan.
 */
function buildHeatmap(dailyAdded: Record<string, number>): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  const now = new Date();

  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const rawVal = dailyAdded[key] || 0;
    let value = 0;
    for (let lvl = HEATMAP_THRESHOLDS.length - 1; lvl >= 1; lvl--) {
      if (rawVal >= HEATMAP_THRESHOLDS[lvl]) {
        value = lvl;
        break;
      }
    }

    cells.push({ date: d, value, rawVal });
  }

  return cells;
}

/**
 * Bangun daily activity N hari terakhir.
 */
function buildDailyActivity(
  dailyAdded: Record<string, number>,
  days: number
): DailyActivity[] {
  const result: DailyActivity[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: d, value: dailyAdded[key] || 0 });
  }

  return result;
}

/**
 * Bangun hourly pattern: 24 elemen, index = jam (0-23).
 */
function buildHourlyPattern(timestamps: number[]): number[] {
  const hours = new Array(24).fill(0) as number[];
  for (const ts of timestamps) {
    const h = new Date(ts).getHours();
    hours[h]++;
  }
  return hours;
}

/**
 * Parse conventional commit types dari messages.
 */
function parseCommitTypes(messages: string[]): CommitTypeStat[] {
  const counts = new Map<string, number>();
  const typeRegex = /^(\w+)(?:\(.+\))?:/;

  for (const msg of messages) {
    const m = msg.match(typeRegex);
    if (m) {
      const type = m[1];
      counts.set(type, (counts.get(type) || 0) + 1);
    }
  }

  return COMMIT_TYPES_DEFS
    .filter(def => (counts.get(def.type) || 0) > 0)
    .map(def => ({
      type: def.type,
      label: def.label,
      color: def.color,
      count: counts.get(def.type) || 0,
    }))
    .sort((a, b) => b.count - a.count);
}