import { execSync } from "child_process";
import path from "path";
import type { GitCommit, GitLogResult, TopFile, LogEntry } from "./types";
import { AnalysisError } from "./types";

interface GitExecOptions {
  cwd: string;
  encoding: "utf8";
  maxBuffer: number;
  timeout: number;
}

const GIT_OPTS: GitExecOptions = {
  cwd: "",
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  timeout: 30_000,
};

function git(repoPath: string, args: string): string {
  try {
    return execSync(`git ${args}`, { ...GIT_OPTS, cwd: repoPath });
  } catch {
    return "";
  }
}

export function isGitRepo(repoPath: string): boolean {
  const out = git(repoPath, "rev-parse --is-inside-work-tree 2>&1");
  return out.trim() === "true";
}

export function getCurrentBranch(repoPath: string): string {
  return git(repoPath, 'branch --show-current').trim() || 'HEAD';
}

export function parseGitLog(repoPath: string): GitLogResult {
  const raw = git(
    repoPath,
    'log --all --pretty=format:"COMMIT|%aI|%s" --shortstat',
  );

  if (!raw.trim()) {
    return { commits: [], timestamps: [], messages: [], dailyAdded: {} };
  }

  const lines = raw.split("\n");
  const commits: GitCommit[] = [];
  const timestamps: number[] = [];
  const messages: string[] = [];
  const dailyAdded: Record<string, number> = {};

  let current: GitCommit | null = null;
  const shortstatRegex =
    /(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/;

  for (const line of lines) {
    if (line.startsWith("COMMIT|")) {
      if (current) commits.push(current);

      const pipeIndex = line.indexOf("|", 7); // skip "COMMIT|"
      const isoDate = line.slice(7, pipeIndex);
      const msg = line.slice(pipeIndex + 1);
      const date = new Date(isoDate);

      timestamps.push(date.getTime());
      messages.push(msg);
      current = { date, message: msg, additions: 0, deletions: 0, files: 0 };
    } else if (current && line.trim()) {
      const m = line.match(shortstatRegex);
      if (m) {
        current.files = parseInt(m[1], 10) || 0;
        current.additions = parseInt(m[2], 10) || 0;
        current.deletions = parseInt(m[3], 10) || 0;

        const dayKey = current.date.toISOString().slice(0, 10);
        dailyAdded[dayKey] = (dailyAdded[dayKey] || 0) + current.additions;
      }
    }
  }

  if (current) commits.push(current);

  return { commits, timestamps, messages, dailyAdded }
}

export function getFileFrequencies(
    repoPath: string,
    limit = 8
): Array<{ path: string; edits: number }> {
    const raw = git(repoPath, 'log --all --name-only --pretty=format:""');
    if (!raw.trim()) return [];

    const counts = new Map<string, number>();
    for (const f of raw.split('\n')) {
        const trimmed = f.trim();
        if (trimmed) {
            counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
        }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([filePath, edits]) => ({path: filePath, edits}));
}

export function getRecentLog(repoPath: string): LogEntry[] {
    const raw = git(repoPath, 'log -10 --pretty=format:"%aI|%s"');
    if (!raw.trim()) return [];

    return raw.split('\n').map(line => {
        const pipeIdx = line.indexOf('|');
        const isoDate = line.slice(0, pipeIdx);
        const msg = line.slice(pipeIdx + 1);
        const d = new Date(isoDate);
        const time = d.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        return {
            time,
            action: 'commit' as const,
            detail: msg,
        }
    })
}