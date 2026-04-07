export interface GitCommit {
  date: Date;
  message: string;
  additions: number;
  deletions: number;
  files: number;
}

export interface GitLogResult {
  commits: GitCommit[];
  timestamps: number[];
  messages: string[];
  dailyAdded: Record<string, number>;
}

export interface RepoInfo {
  name: string;
  path: string;
  branch: string;
}

export interface TopFile {
  path: string;
  edits: number;
  lines: number;
  lang: string;
  langName: string;
}

export interface LanguageStat {
  name: string;
  lines: number;
  files: number;
  color: string;
}

export interface CommitTypeStat {
  type: string;
  label: string;
  count: number;
  color: string;
}

export interface HeatmapCell {
  date: Date;
  value: number;
  rawVal: number;
}

export interface DailyActivity {
  date: Date;
  value: number;
}

export interface LogEntry {
  time: string;
  action: 'commit' | 'push' | 'edit' | 'merge';
  detail: string;
}

export interface Stats {
  lines: number;
  files: number;
  hours: number;
  commits: number;
}

export interface AnalysisResult {
  repo: RepoInfo;
  stats: Stats;
  languages: LanguageStat[];
  heatmap: HeatmapCell[];
  dailyActivity: DailyActivity[];
  hourlyPattern: number[];
  topFiles: TopFile[];
  commitTypes: CommitTypeStat[];
  recentLog: LogEntry[];
  streak: number;
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}