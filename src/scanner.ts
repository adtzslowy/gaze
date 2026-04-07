import fs from 'fs';
import path from 'path';
import type { LanguageStat } from './types.js';
import { EXT_TO_LANG, LANG_COLORS, SKIP_DIRS, MAX_FILE_SIZE } from './constants.js';

export interface ScanResult {
  langData: Record<string, { lines: number; files: number }>;
  fileLines: Record<string, number>;
  totalFiles: number;
  totalLines: number;
}

export interface ScanProgress {
  scannedFiles: number;
}

type ProgressCallback = (progress: ScanProgress) => void;

/**
 * Recursive walk directory.
 * Skip folder yang ada di SKIP_DIRS.
 * Hanya proses file yang extension-nya dikenali di EXT_TO_LANG.
 */
export function scanDirectory(
  repoPath: string,
  onProgress?: ProgressCallback
): ScanResult {
  const langData: Record<string, { lines: number; files: number }> = {};
  const fileLines: Record<string, number> = {};
  let totalFiles = 0;
  let totalLines = 0;
  let scanned = 0;

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip folder yang tidak bisa dibaca
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = getExtension(entry.name);
        const langName = EXT_TO_LANG[ext];

        if (!langName) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_FILE_SIZE) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = countLines(content);
          const relPath = path.relative(repoPath, fullPath);

          if (!langData[langName]) {
            langData[langName] = { lines: 0, files: 0 };
          }
          langData[langName].lines += lines;
          langData[langName].files += 1;
          fileLines[relPath] = lines;
          totalFiles++;
          totalLines += lines;
        } catch {
          // skip file yang tidak bisa dibaca
        }

        scanned++;
        if (scanned % 200 === 0 && onProgress) {
          onProgress({ scannedFiles: scanned });
        }
      }
    }
  }

  walk(repoPath);
  return { langData, fileLines, totalFiles, totalLines };
}

/** Convert scan result ke array LanguageStat yang ter-sort */
export function buildLanguageStats(
  langData: ScanResult['langData']
): LanguageStat[] {
  return Object.entries(langData)
    .sort((a, b) => b[1].lines - a[1].lines)
    .map(([name, data]) => ({
      name,
      lines: data.lines,
      files: data.files,
      color: LANG_COLORS[name] || '#7a8a9e',
    }));
}

function getExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === filename.length - 1) return '';
  return filename.slice(dotIdx + 1).toLowerCase();
}

function countLines(content: string): number {
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') count++;
  }
  // File yang tidak newline di akhir tetap dihitung 1 baris
  return count > 0 ? count : (content.length > 0 ? 1 : 0);
}