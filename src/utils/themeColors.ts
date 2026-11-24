export const DARK_COLOR_FIELDS = [
  { key: 'background', label: 'Màu nền' },
  { key: 'card', label: 'Nền thẻ' },
  { key: 'muted', label: 'Nền phụ (ô, thanh)' },
  { key: 'foreground', label: 'Màu chữ chính' },
  { key: 'muted-foreground', label: 'Màu chữ phụ' },
  { key: 'primary', label: 'Màu nhấn' },
  { key: 'border', label: 'Màu viền' },
] as const;

export type DarkColorKey = (typeof DARK_COLOR_FIELDS)[number]['key'];
export type DarkColors = Partial<Record<DarkColorKey, string>>; // giá trị hex "#rrggbb"

const STORAGE_KEY = 'app_dark_colors';
// Các biến suy ra từ màu nhấn, được gỡ cùng lúc khi quay về mặc định.
const DERIVED_VARS = ['--color-secondary', '--color-accent', '--color-ring', '--color-on-primary'];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

const toVar = (rgb: RGB) => rgb.map((v) => Math.round(v)).join(' ');

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

export function loadDarkColors(): DarkColors {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const out: DarkColors = {};
    for (const f of DARK_COLOR_FIELDS) {
      if (isValidHex(parsed?.[f.key])) out[f.key] = parsed[f.key];
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDarkColors(colors: DarkColors): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch (e) {
    console.error('Không lưu được màu tùy chỉnh:', e);
  }
}

/**
 * Ghi đè các biến màu của dark mode. Ở light mode thì gỡ hết ghi đè,
 * nên light mode không bao giờ bị ảnh hưởng.
 */
export function applyDarkColors(isDark: boolean): void {
  const root = document.documentElement;
  const allVars = [...DARK_COLOR_FIELDS.map((f) => `--color-${f.key}`), ...DERIVED_VARS];
  allVars.forEach((p) => root.style.removeProperty(p));
  if (!isDark) return;

  const saved = loadDarkColors();
  for (const f of DARK_COLOR_FIELDS) {
    const hex = saved[f.key];
    if (hex) root.style.setProperty(`--color-${f.key}`, toVar(hexToRgb(hex)));
  }

  // Màu nhấn kéo theo các màu phụ thuộc, để chỉ cần chỉnh một ô.
  if (saved.primary) {
    const p = hexToRgb(saved.primary);
    root.style.setProperty('--color-ring', toVar(p));
    root.style.setProperty('--color-secondary', toVar(mix(p, [0, 0, 0], 0.2)));
    root.style.setProperty('--color-accent', toVar(mix(p, [255, 255, 255], 0.2)));
    const lum = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
    root.style.setProperty('--color-on-primary', lum > 0.6 ? '26 26 26' : '255 255 255');
  }
}

/** Đọc màu mặc định (khối `.dark` trong App.css), bỏ qua phần đang ghi đè. */
export function readDefaultColors(): Record<DarkColorKey, string> {
  const root = document.documentElement;
  const out = {} as Record<DarkColorKey, string>;
  for (const f of DARK_COLOR_FIELDS) {
    const prop = `--color-${f.key}`;
    const prev = root.style.getPropertyValue(prop);
    root.style.removeProperty(prop);
    const parts = getComputedStyle(root).getPropertyValue(prop).trim().split(/\s+/).map(Number);
    if (prev) root.style.setProperty(prop, prev);
    out[f.key] = parts.length === 3 && parts.every((n) => !Number.isNaN(n))
      ? rgbToHex(parts as RGB)
      : '#000000';
  }
  return out;
}