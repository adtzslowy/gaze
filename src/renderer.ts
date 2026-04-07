import type {
  AnalysisResult,
  DailyActivity,
  LanguageStat,
  HeatmapCell,
  TopFile,
  CommitTypeStat,
  LogEntry,
} from "./types.js";
import { HEATMAP_COLORS, LANG_COLORS } from "./constants.js";

declare const Chart: {
  new (
    ctx: CanvasRenderingContext2D,
    config: Record<string, unknown>,
  ): ChartInstance;
};

interface ChartInstance {
  destroy(): void;
}

interface ChartTooltipItem {
  raw: unknown;
  label?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      pickFolder: () => Promise<string | null>;
      pathExists: (p: string) => Promise<boolean>;
      analyzeRepo: (path: string) => Promise<AnalysisResult>;
    };
  }
}

let currentRepoPath: string | null = null;
let currentData: AnalysisResult | null = null;
let chartActivity: ChartInstance | null = null;
let chartLang: ChartInstance | null = null;
let chartHourly: ChartInstance | null = null;

const isElectron = window.electronAPI?.isElectron ?? false;

console.log(
  "[CodePulse] Mode:",
  isElectron ? "ELECTRON" : "BROWSER (demo only)",
);
console.log("[CodePulse] electronAPI:", window.electronAPI);

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

function init(): void {
  console.log("[CodePulse] DOM ready");
  setupModeBadge();
  setupEventListeners();
  initCardGlow();
  const input = document.getElementById("pathInput") as HTMLInputElement | null;
  input?.focus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init(); // DOM already ready, call directly
}
function setupModeBadge(): void {
  const badge = document.getElementById("modeBadge");
  if (!badge) return;
  if (isElectron) {
    badge.textContent = "ELECTRON MODE — Data Real";
    badge.style.borderColor = "rgba(0,230,138,0.3)";
    badge.style.color = "var(--accent)";
  } else {
    badge.textContent = "BROWSER MODE — Demo Data";
    badge.style.borderColor = "rgba(255,140,66,0.3)";
    badge.style.color = "var(--orange)";
  }
  const pickBtn = document.getElementById("pickFolderBtn");
  if (pickBtn && !isElectron) pickBtn.style.display = "none";
}

function setupEventListeners(): void {
  document
    .getElementById("pickFolderBtn")
    ?.addEventListener("click", async () => {
      if (!window.electronAPI) return;
      const folder = await window.electronAPI.pickFolder();
      if (folder) {
        const input = document.getElementById(
          "pathInput",
        ) as HTMLInputElement | null;
        if (input) input.value = folder;
      }
    });

document.getElementById('scanBtn')?.addEventListener('click', () => {
  console.log('[CodePulse] Scan button clicked');
  try {
    startScan();
  } catch (err) {
    console.error('Error in startScan:', err);
  }
});

  document.getElementById("pathInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startScan();
  });

  document.getElementById("rescanBtn")?.addEventListener("click", async () => {
    if (!currentRepoPath) return;
    await runAnalysis(currentRepoPath);
  });

  document.getElementById("changeRepoBtn")?.addEventListener("click", () => {
    showScreen("welcomeScreen");
  });

  document.querySelectorAll(".tbtn[data-cr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tbtn[data-cr]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (!currentData) return;
      const days = parseInt((btn as HTMLElement).dataset.cr || "30", 10);
      renderActivityChart(currentData.dailyActivity.slice(-days));
    });
  });
}

// ═══════════════════════════════════════════════════════
// ANALYSIS FLOW
// ═══════════════════════════════════════════════════════

async function startScan(): Promise<void> {
  hideError();
  const input = document.getElementById("pathInput") as HTMLInputElement | null;
  const repoPath = input?.value.trim() || "";

  console.log(
    "[CodePulse] startScan, path:",
    repoPath,
    "isElectron:",
    isElectron,
  );

  if (!isElectron) {
    console.log("[CodePulse] Loading demo data...");
    currentData = generateDemoData();
    renderDashboard(currentData);
    return;
  }

  if (!repoPath) {
    showError("Masukkan path ke direktori repositori.");
    return;
  }

  try {
    const exists = await window.electronAPI!.pathExists(repoPath);
    if (!exists) {
      showError("Direktori tidak ditemukan. Cek path-nya lagi.");
      return;
    }
  } catch (err) {
    showError(
      `Gagal mengecek path: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  currentRepoPath = repoPath;
  await runAnalysis(repoPath);
}

async function runAnalysis(repoPath: string): Promise<void> {
  resetLoadingScreen();
  showScreen("loadingScreen");
  appendLoadLine(
    `<span style="color:var(--accent);">$</span> codepulse --scan <span style="color:var(--cyan);">${repoPath}</span>`,
  );
  appendLoadLine(
    `<span style="color:var(--text-muted);">→ Menganalisis repositori, harap tunggu...</span>`,
  );
  updateLoadingUI("Menganalisis repositori...", 50);

  try {
    const result = await window.electronAPI!.analyzeRepo(repoPath);
    updateLoadingUI("Selesai", 100);
    currentData = result;
    renderDashboard(result);
  } catch (err) {
    appendLoadLine(
      `<span style="color:var(--red);">✗ Error: ${err instanceof Error ? err.message : String(err)}</span>`,
    );
    setTimeout(() => {
      showScreen("welcomeScreen");
      showError(err instanceof Error ? err.message : String(err));
    }, 2000);
  }
}

// ═══════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════

function showScreen(id: string): void {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

function showError(msg: string): void {
  const box = document.getElementById("errorBox");
  if (!box) return;
  box.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${msg}`;
  box.style.display = "block";
}

function hideError(): void {
  const box = document.getElementById("errorBox");
  if (box) box.style.display = "none";
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function resetLoadingScreen(): void {
  const output = document.getElementById("loadOutput");
  const bar = document.getElementById("loadBar");
  const stepEl = document.getElementById("loadStep");
  const pctEl = document.getElementById("loadPct");
  if (output) output.innerHTML = "";
  if (bar) bar.style.width = "0%";
  if (stepEl) stepEl.textContent = "Initializing...";
  if (pctEl) pctEl.textContent = "0%";
}

function appendLoadLine(html: string): void {
  const output = document.getElementById("loadOutput");
  if (!output) return;
  const div = document.createElement("div");
  div.innerHTML = html;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function updateLoadingUI(step: string, percent: number): void {
  const bar = document.getElementById("loadBar");
  const stepEl = document.getElementById("loadStep");
  const pctEl = document.getElementById("loadPct");
  if (bar) bar.style.width = `${percent}%`;
  if (stepEl) stepEl.textContent = step;
  if (pctEl) pctEl.textContent = `${percent}%`;
  appendLoadLine(`<span style="color:var(--text-muted);">→ ${step}</span>`);
}

// ═══════════════════════════════════════════════════════
// COUNTER ANIMATION
// ═══════════════════════════════════════════════════════

function animateCounter(
  el: HTMLElement | null,
  target: number,
  duration = 1500,
): void {
  if (!el) return;
  const safeEl = el;
  const start = performance.now();
  function tick(now: number): void {
    const p = Math.min((now - start) / duration, 1);
    const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    safeEl.textContent = Math.floor(target * ease).toLocaleString("id-ID");
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════════════════
// RENDER DASHBOARD
// ═══════════════════════════════════════════════════════

function renderDashboard(data: AnalysisResult): void {
  console.log("[CodePulse] Rendering dashboard...");
  showScreen("dashboardScreen");

  setText("headerRepo", `${data.repo.name} (${data.repo.branch})`);
  setText("repoNameDisplay", data.repo.name);

  const summary = document.getElementById("summaryLine");
  if (summary) {
    summary.innerHTML =
      `<span class="font-mono font-semibold" style="color:var(--text-primary);">${data.stats.lines.toLocaleString()} baris</span> dalam ` +
      `<span class="font-mono font-semibold" style="color:var(--text-primary);">${data.stats.files} file</span> — ` +
      `dari <span class="font-mono font-semibold" style="color:var(--text-primary);">${data.stats.commits.toLocaleString()} commit</span>`;
  }

  setText("streakVal", String(data.streak));
  animateCounter(document.getElementById("sLines"), data.stats.lines);
  animateCounter(document.getElementById("sFiles"), data.stats.files);
  animateCounter(document.getElementById("sHours"), data.stats.hours);
  animateCounter(document.getElementById("sCommits"), data.stats.commits);

  renderActivityChart(data.dailyActivity.slice(-30));
  renderLangChart(data.languages);
  renderHourlyChart(data.hourlyPattern);
  renderHeatmap(data.heatmap);
  renderTopFiles(data.topFiles);
  renderCommitTypes(data.commitTypes);
  renderTerminalLog(data.recentLog);
  initCardGlow();

  console.log("[CodePulse] Dashboard rendered.");
}

// ═══════════════════════════════════════════════════════
// CHART: Aktivitas Harian
// ═══════════════════════════════════════════════════════

function renderActivityChart(activityData: DailyActivity[]): void {
  if (chartActivity) chartActivity.destroy();
  const canvas = document.getElementById(
    "actChart",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const labels = activityData.map((d) =>
    d.date.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
  );
  const values = activityData.map((d) => d.value);

  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(0,230,138,0.25)");
  grad.addColorStop(0.5, "rgba(0,230,138,0.08)");
  grad.addColorStop(1, "rgba(0,230,138,0.0)");

  chartActivity = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: "#00e68a",
          borderWidth: 2,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          pointRadius: activityData.length <= 30 ? 2 : 0,
          pointBackgroundColor: "#00e68a",
          pointBorderColor: "#0a0e14",
          pointBorderWidth: 2,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a2736",
          borderColor: "rgba(0,230,138,0.3)",
          borderWidth: 1,
          titleFont: { family: "JetBrains Mono", size: 11 },
          bodyFont: { family: "JetBrains Mono", size: 11 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: (item: ChartTooltipItem) =>
              `${Number(item.raw).toLocaleString("id-ID")} baris ditambahkan`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          ticks: {
            color: "#4a5568",
            font: { family: "JetBrains Mono", size: 9 },
            maxRotation: 0,
            maxTicksLimit: 10,
          },
          border: { display: false },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          ticks: {
            color: "#4a5568",
            font: { family: "JetBrains Mono", size: 9 },
            callback: (v: unknown) => {
              const n = Number(v);
              return n >= 1000 ? n / 1000 + "k" : String(n);
            },
          },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════
// CHART: Bahasa (Donut)
// ═══════════════════════════════════════════════════════

function renderLangChart(languages: LanguageStat[]): void {
  if (chartLang) chartLang.destroy();
  const canvas = document.getElementById(
    "langChart",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const total = languages.reduce((s, l) => s + l.lines, 0);

  chartLang = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: languages.map((l) => l.name),
      datasets: [
        {
          data: languages.map((l) => l.lines),
          backgroundColor: languages.map((l) => l.color),
          borderColor: "#111a24",
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a2736",
          borderColor: "rgba(0,230,138,0.3)",
          borderWidth: 1,
          titleFont: { family: "JetBrains Mono", size: 11 },
          bodyFont: { family: "JetBrains Mono", size: 11 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: (item: ChartTooltipItem) => {
              const v = Number(item.raw);
              return `${v.toLocaleString("id-ID")} baris (${((v / total) * 100).toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  const langBar = document.getElementById("langBar");
  if (langBar) {
    langBar.innerHTML = languages
      .map(
        (l) =>
          `<div class="lang-seg" style="width:${((l.lines / total) * 100).toFixed(1)}%;background:${l.color};"></div>`,
      )
      .join("");
  }

  const legend = document.getElementById("langLegend");
  if (legend) {
    legend.innerHTML = languages
      .map((l) => {
        const pct = ((l.lines / total) * 100).toFixed(1);
        return `<div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <div style="width:8px;height:8px;border-radius:2px;background:${l.color};flex-shrink:0;"></div>
          <span style="color:var(--text-secondary);">${l.name}</span>
        </div>
        <span class="font-mono" style="color:var(--text-muted);">${pct}%</span>
      </div>`;
      })
      .join("");
  }
}

// ═══════════════════════════════════════════════════════
// CHART: Hourly Pattern
// ═══════════════════════════════════════════════════════

function renderHourlyChart(pattern: number[]): void {
  if (chartHourly) chartHourly.destroy();
  const canvas = document.getElementById(
    "hourChart",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const labels = Array.from(
    { length: 24 },
    (_, i) => `${String(i).padStart(2, "0")}:00`,
  );
  const maxVal = Math.max(...pattern, 1);

  chartHourly = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: pattern,
          backgroundColor: pattern.map((v) => {
            const r = v / maxVal;
            if (r > 0.8) return "#00e68a";
            if (r > 0.5) return "#00b36b";
            if (r > 0.2) return "#007a4d";
            if (v > 0) return "#0a3d2a";
            return "#0f1923";
          }),
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.85,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a2736",
          borderColor: "rgba(0,230,138,0.3)",
          borderWidth: 1,
          titleFont: { family: "JetBrains Mono", size: 11 },
          bodyFont: { family: "JetBrains Mono", size: 11 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items: ChartTooltipItem[]) => `Jam ${items[0]?.label}`,
            label: (item: ChartTooltipItem) => `${item.raw} commit`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#4a5568",
            font: { family: "JetBrains Mono", size: 8 },
            maxRotation: 0,
            callback: (_v: unknown, idx: number) =>
              idx % 3 === 0 ? labels[idx] : "",
          },
          border: { display: false },
        },
        y: { display: false, beginAtZero: true },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════
// HEATMAP
// ═══════════════════════════════════════════════════════

function renderHeatmap(cells: HeatmapCell[]): void {
  const container = document.getElementById('hmCells');
  const monthCont = document.getElementById('monthLabels');
  const tip = document.getElementById('tooltip');
  if (!container || !monthCont || !tip) return;

  container.innerHTML = '';
  monthCont.innerHTML = '';

  const weeks: (HeatmapCell | null)[][] = [];
  let curWeek: (HeatmapCell | null)[] = [];

  // Mulai dari Senin (0=Sen, 6=Min)
  const startOffset = (cells[0].date.getDay() + 6) % 7;
  for (let i = 0; i < startOffset; i++) curWeek.push(null);

  for (const cell of cells) {
    curWeek.push(cell);
    if (curWeek.length === 7) { weeks.push(curWeek); curWeek = []; }
  }
  if (curWeek.length > 0) {
    while (curWeek.length < 7) curWeek.push(null);
    weeks.push(curWeek);
  }

  // Hitung lebar cell secara dinamis supaya full width
  const totalWeeks = weeks.length;
  const containerWidth = container.parentElement?.clientWidth || 700;
  const dayLabelWidth = 28;
  const gap = 2;
  const cellSize = Math.floor((containerWidth - dayLabelWidth - (gap * totalWeeks)) / totalWeeks);
  const clampedCell = Math.max(8, Math.min(14, cellSize));

  container.style.display = 'flex';
  container.style.gap = `${gap}px`;
  container.style.width = '100%';

  let monthTrack = '';
  const monthSpans: Array<{ label: string; wi: number }> = [];

  weeks.forEach((week, wi) => {
    const col = document.createElement('div');
    col.style.cssText = `display:flex;flex-direction:column;gap:${gap}px;flex:1;`;

    week.forEach(day => {
      const el = document.createElement('div');
      el.style.cssText = `width:100%;aspect-ratio:1;border-radius:2px;transition:all 0.15s;cursor:pointer;`;

      if (!day) {
        el.style.background = 'transparent';
        el.style.cursor = 'default';
      } else {
        el.style.background = HEATMAP_COLORS[day.value];

        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent;
          const linesText = day.rawVal === 0
            ? 'Tidak ada aktivitas'
            : `${day.rawVal.toLocaleString()} baris ditambahkan`;
          tip.innerHTML = `<span style="color:var(--text-primary);">${linesText}</span><br><span style="color:var(--text-muted);">${day.date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>`;
          tip.classList.add('vis');
          const r = (me.target as HTMLElement).getBoundingClientRect();
          tip.style.left = `${r.left + r.width / 2 - tip.offsetWidth / 2}px`;
          tip.style.top = `${r.top - tip.offsetHeight - 8}px`;
        });

        el.addEventListener('mouseleave', () => tip.classList.remove('vis'));
      }

      col.appendChild(el);
    });

    const firstValid = week.find(d => d !== null);
    if (firstValid) {
      const mn = firstValid.date.toLocaleDateString('id-ID', { month: 'short' });
      if (mn !== monthTrack) { monthTrack = mn; monthSpans.push({ label: mn, wi }); }
    }

    container.appendChild(col);
  });

  // Month labels
  monthCont.style.cssText = 'position:relative;width:100%;';
  monthSpans.forEach(ms => {
    const span = document.createElement('span');
    span.textContent = ms.label;
    span.style.cssText = `position:absolute;left:${(ms.wi / totalWeeks) * 100}%;transform:translateX(-50%);font-size:9px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;`;
    monthCont.appendChild(span);
  });
}

// ═══════════════════════════════════════════════════════
// TOP FILES
// ═══════════════════════════════════════════════════════

function renderTopFiles(files: TopFile[]): void {
  const cont = document.getElementById("topFiles");
  if (!cont) return;
  const maxEdits = files.length > 0 ? files[0].edits : 1;

  cont.innerHTML = files
    .map((f, i) => {
      const bw = ((f.edits / maxEdits) * 100).toFixed(0);
      const color = LANG_COLORS[f.langName] || "#7a8a9e";
      return `<div class="file-item">
      <span class="font-mono text-[10px]" style="color:var(--text-muted);width:16px;text-align:right;">${i + 1}</span>
      <div style="width:6px;height:6px;border-radius:2px;background:${color};flex-shrink:0;"></div>
      <div class="flex-1 min-w-0">
        <div class="font-mono text-xs truncate" style="color:var(--text-primary);" title="${f.path}">${f.path}</div>
        <div class="mt-1.5 rounded-full overflow-hidden" style="height:3px;background:rgba(255,255,255,0.04);">
          <div style="width:${bw}%;height:100%;background:${color};border-radius:3px;transition:width 1s ease;"></div>
        </div>
      </div>
      <div class="text-right flex-shrink:0">
        <div class="font-mono text-xs font-semibold" style="color:var(--text-primary);">${f.edits}x</div>
        <div class="font-mono text-[9px]" style="color:var(--text-muted);">${f.lines.toLocaleString()} ln</div>
      </div>
    </div>`;
    })
    .join("");
}

// ═══════════════════════════════════════════════════════
// COMMIT TYPES
// ═══════════════════════════════════════════════════════

function renderCommitTypes(types: CommitTypeStat[]): void {
  const cont = document.getElementById("commitTypes");
  if (!cont) return;
  const total = types.reduce((s, t) => s + t.count, 0);
  const maxCount = types.length > 0 ? types[0].count : 1;

  cont.innerHTML = types
    .map((ct) => {
      const pct = ((ct.count / total) * 100).toFixed(1);
      const bw = ((ct.count / maxCount) * 100).toFixed(0);
      return `<div>
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style="background:${ct.color}20;color:${ct.color};">${ct.type}</span>
          <span class="text-xs" style="color:var(--text-secondary);">${ct.label}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-mono text-xs font-semibold" style="color:var(--text-primary);">${ct.count.toLocaleString()}</span>
          <span class="font-mono text-[10px]" style="color:var(--text-muted);">${pct}%</span>
        </div>
      </div>
      <div class="rounded-full overflow-hidden" style="height:5px;background:rgba(255,255,255,0.04);">
        <div style="width:${bw}%;height:100%;background:${ct.color};border-radius:3px;transition:width 1.2s ease;"></div>
      </div>
    </div>`;
    })
    .join("");
}

// ═══════════════════════════════════════════════════════
// TERMINAL LOG
// ═══════════════════════════════════════════════════════

function renderTerminalLog(logs: LogEntry[]): void {
  const cont = document.getElementById("termLog");
  if (!cont) return;

  const actionColors: Record<string, string> = {
    commit: "#00e68a",
    push: "#00d4ff",
    edit: "#ffd166",
    merge: "#ff8c42",
  };
  const actionIcons: Record<string, string> = {
    commit: "●",
    push: "⬆",
    edit: "✎",
    merge: "⤝",
  };

  cont.innerHTML =
    logs
      .map((a, i) => {
        const c = actionColors[a.action] || "#7a8a9e";
        const ic = actionIcons[a.action] || "○";
        return `<div class="flex gap-3 items-start" style="opacity:0;animation:fadeUp 0.3s ease ${i * 0.06}s forwards;">
      <span style="color:var(--text-muted);flex-shrink:0;">${a.time}</span>
      <span style="color:${c};flex-shrink:0;">${ic}</span>
      <span style="color:var(--text-secondary);flex:1;" class="truncate">${a.detail}</span>
    </div>`;
      })
      .join("") +
    `<div class="typing-cursor" style="color:var(--text-muted);margin-top:4px;">$</div>`;
}

// ═══════════════════════════════════════════════════════
// CARD GLOW
// ═══════════════════════════════════════════════════════

function initCardGlow(): void {
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("mousemove", (e: Event) => {
      const me = e as MouseEvent;
      const el = card as HTMLElement;
      const r = el.getBoundingClientRect();
      el.style.background = `radial-gradient(300px circle at ${me.clientX - r.left}px ${me.clientY - r.top}px, rgba(0,230,138,0.04), var(--bg-card-hover) 70%)`;
    });
    card.addEventListener("mouseleave", () => {
      (card as HTMLElement).style.background = "";
    });
  });
}

// ═══════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════

function generateDemoData(): AnalysisResult {
  const dailyAdded: Record<string, number> = {};
  const dailyActivity: DailyActivity[] = [];
  const now = new Date();

  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const isWE = d.getDay() === 0 || d.getDay() === 6;
    const val = Math.max(
      0,
      Math.floor((isWE ? 30 : 180) + Math.random() * (isWE ? 100 : 350)),
    );
    const key = d.toISOString().slice(0, 10);
    dailyAdded[key] = val;
    dailyActivity.push({ date: d, value: val });
  }

  for (let i = 364; i >= 90; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (Math.random() < (d.getDay() === 0 || d.getDay() === 6 ? 0.4 : 0.78)) {
      dailyAdded[d.toISOString().slice(0, 10)] =
        Math.floor(Math.random() * 800) + 10;
    }
  }

  const timestamps: number[] = [];
  for (let i = 0; i < 3891; i++) {
    const d = new Date(now.getTime() - Math.random() * 365 * 86400000);
    d.setHours(Math.floor(Math.random() * 16) + 7);
    timestamps.push(d.getTime());
  }

  const hours = new Array(24).fill(0) as number[];
  for (const ts of timestamps) hours[new Date(ts).getHours()]++;

  const heatmapCells: HeatmapCell[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const rawVal = dailyAdded[d.toISOString().slice(0, 10)] || 0;
    let value = 0;
    if (rawVal > 0) value = 1;
    if (rawVal > 50) value = 2;
    if (rawVal > 200) value = 3;
    if (rawVal > 500) value = 4;
    if (rawVal > 1000) value = 5;
    heatmapCells.push({ date: d, value, rawVal });
  }

  return {
    repo: { name: "demo-project", path: "/demo", branch: "main" },
    stats: { lines: 847293, files: 1842, hours: 1247, commits: 3891 },
    languages: [
      { name: "TypeScript", lines: 312450, files: 234, color: "#3178c6" },
      { name: "Rust", lines: 187320, files: 98, color: "#ff8c42" },
      { name: "Python", lines: 134200, files: 167, color: "#ffd166" },
      { name: "Go", lines: 98400, files: 76, color: "#00d4ff" },
      { name: "Lua", lines: 52300, files: 42, color: "#00e68a" },
      { name: "Lainnya", lines: 62623, files: 225, color: "#7a8a9e" },
    ],
    heatmap: heatmapCells,
    dailyActivity,
    hourlyPattern: hours,
    topFiles: [
      {
        path: "src/core/engine.ts",
        edits: 342,
        lines: 4820,
        lang: "ts",
        langName: "TypeScript",
      },
      {
        path: "src/render/webgl.rs",
        edits: 287,
        lines: 3650,
        lang: "rs",
        langName: "Rust",
      },
      {
        path: "src/parser/ast.ts",
        edits: 234,
        lines: 2980,
        lang: "ts",
        langName: "TypeScript",
      },
      {
        path: "pkg/net/tcp.go",
        edits: 198,
        lines: 2140,
        lang: "go",
        langName: "Go",
      },
      {
        path: "src/ml/inference.py",
        edits: 176,
        lines: 1870,
        lang: "py",
        langName: "Python",
      },
      {
        path: "plugin/lsp/init.lua",
        edits: 156,
        lines: 1240,
        lang: "lua",
        langName: "Lua",
      },
      {
        path: "src/types/schema.ts",
        edits: 143,
        lines: 980,
        lang: "ts",
        langName: "TypeScript",
      },
      {
        path: "src/db/migrations.rs",
        edits: 128,
        lines: 860,
        lang: "rs",
        langName: "Rust",
      },
    ],
    commitTypes: [
      { type: "feat", label: "Fitur Baru", count: 1247, color: "#00e68a" },
      { type: "fix", label: "Bug Fix", count: 892, color: "#ff5c5c" },
      { type: "refactor", label: "Refaktor", count: 634, color: "#00d4ff" },
      { type: "docs", label: "Dokumentasi", count: 421, color: "#ffd166" },
      { type: "perf", label: "Performa", count: 312, color: "#ff8c42" },
      { type: "test", label: "Testing", count: 234, color: "#ff6b9d" },
      { type: "chore", label: "Maintenance", count: 151, color: "#7a8a9e" },
    ],
    recentLog: [
      {
        time: "23:42",
        action: "commit",
        detail: "feat: implementasi shader pipeline v2",
      },
      {
        time: "23:15",
        action: "commit",
        detail: "fix: resolve memory leak di WebGL context",
      },
      {
        time: "22:38",
        action: "commit",
        detail: "perf: optimasi batch rendering 40% lebih cepat",
      },
      {
        time: "20:12",
        action: "commit",
        detail: "refactor: extract parser ke module terpisah",
      },
      {
        time: "19:45",
        action: "commit",
        detail: "feat: tambah LSP integration support",
      },
      {
        time: "18:30",
        action: "commit",
        detail: "test: tambah integration test untuk AST parser",
      },
      {
        time: "17:15",
        action: "commit",
        detail: "feat: implementasi TCP retry mechanism",
      },
      {
        time: "16:00",
        action: "commit",
        detail: "docs: update README dengan arsitektur terbaru",
      },
      {
        time: "14:22",
        action: "commit",
        detail: "chore: bump dependencies ke versi terbaru",
      },
      {
        time: "11:05",
        action: "commit",
        detail: "style: format ulang kode sesuai linter",
      },
    ],
    streak: 23,
  };
}
