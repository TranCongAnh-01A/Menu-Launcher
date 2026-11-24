import { useEffect, useState } from 'react';
import { Palette } from '@phosphor-icons/react';
import { useTheme } from '../../context/ThemeContext';
import {
  DARK_COLOR_FIELDS,
  DarkColorKey,
  DarkColors,
  applyDarkColors,
  loadDarkColors,
  readDefaultColors,
  saveDarkColors,
} from '../../utils/themeColors';

export function DarkColorSettings() {
  const { actualTheme } = useTheme();
  const [colors, setColors] = useState<DarkColors>(loadDarkColors);
  const [defaults, setDefaults] = useState<Partial<Record<DarkColorKey, string>>>({});

  useEffect(() => {
    if (actualTheme === 'dark') setDefaults(readDefaultColors());
  }, [actualTheme]);

  const commit = (next: DarkColors) => {
    setColors(next);
    saveDarkColors(next);
    applyDarkColors(true);
  };

  const setColor = (key: DarkColorKey, hex: string) => commit({ ...colors, [key]: hex });

  const resetColor = (key: DarkColorKey) => {
    const next = { ...colors };
    delete next[key];
    commit(next);
  };

  if (actualTheme !== 'dark') {
    return (
      <div className="glass-card rounded-xl p-4 text-xs text-muted-foreground">
        Chuyển sang chế độ <b>Tối</b> để tùy chỉnh màu.
      </div>
    );
  }

  const hasCustom = Object.keys(colors).length > 0;

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Palette size={20} weight="regular" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Màu chế độ Tối</p>
            <p className="text-xs text-muted-foreground">Chỉ áp dụng khi đang dùng giao diện tối.</p>
          </div>
        </div>
        <button
          onClick={() => commit({})}
          disabled={!hasCustom}
          className="btn-ghost border border-border px-3 py-1.5 text-xs hover:border-primary"
        >
          Đặt lại tất cả
        </button>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        {DARK_COLOR_FIELDS.map((f) => {
          const value = colors[f.key] ?? defaults[f.key] ?? '#000000';
          const isCustom = colors[f.key] !== undefined;
          return (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">{f.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setColor(f.key, e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  title={`Chọn ${f.label.toLowerCase()}`}
                />
                <button
                  onClick={() => resetColor(f.key)}
                  disabled={!isCustom}
                  className="btn-ghost px-2 py-1 text-[11px]"
                >
                  Mặc định
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}