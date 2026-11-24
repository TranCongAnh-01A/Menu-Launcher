import { useState } from 'react';
import { SquaresFour, Gear } from '@phosphor-icons/react';
import { SettingsModal } from '../features/Settings/SettingsModal';
import { GroupNavList } from '../features/Grouping/GroupNavList';

export function Sidebar() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <aside
      className="glass-panel relative z-20 flex w-full sm:w-[260px] h-auto sm:h-full flex-shrink-0 flex-col rounded-2xl"
    >
      {/* Header / Logo */}
      <div className="flex h-16 flex-shrink-0 items-center border-b border-border gap-3 px-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          <SquaresFour size={20} weight="regular" />
        </div>

        <div className="transition-all duration-300 ease-smooth origin-left max-w-[180px] opacity-100">
          <h1 className="font-serif text-xl font-bold leading-none tracking-tight">
            Launcher
          </h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Minimal space</p>
        </div>
      </div>

      {/* Danh sách nhóm */}
      <div className="flex min-h-0 flex-1 flex-col">
        <GroupNavList />
      </div>

      {/* Footer / Settings */}
      <div className="flex-shrink-0 border-t border-border/20 p-4">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="group flex w-full items-center rounded-xl text-foreground/65 transition-all duration-300 ease-smooth hover:bg-muted/80 hover:text-foreground active:scale-[0.98] gap-3 px-3 py-2.5"
          title="Cài đặt"
        >
          <Gear
            size={20}
            className="flex-shrink-0 transition-transform duration-500 ease-smooth group-hover:rotate-45"
          />

          <span className="transition-all duration-300 ease-smooth origin-left max-w-[180px] opacity-100">Cài đặt</span>
        </button>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </aside>
  );
}