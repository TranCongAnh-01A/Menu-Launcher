import { useDroppable } from '@dnd-kit/core';
import { Play } from '@phosphor-icons/react';

interface GroupHeaderDropRowProps {
  groupId: string;
  title: string;
  itemCount?: number;
  // virtualRow: { size: number; start: number; key: string | number };
  virtualRow: { size: number; start: number };
  onLaunchGroup: (groupId: string, title: string) => void;
}

export function GroupHeaderDropRow({
  groupId,
  title,
  itemCount,
  virtualRow,
  onLaunchGroup,
}: GroupHeaderDropRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-header-${groupId}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
      className={`flex items-center justify-between rounded-xl py-2 transition-all ${
        isOver ? 'bg-primary/10 px-3 ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="mr-4 flex flex-shrink-0 items-center gap-2.5">
        <h4
          className="max-w-xs truncate font-serif text-[15px] font-bold tracking-wide text-foreground/90"
          title={title}
        >
          {title}
        </h4>
        {itemCount !== undefined && (
          <span className="rounded-md bg-muted/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
            {itemCount}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLaunchGroup(groupId, title);
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-xs transition-all hover:bg-primary hover:text-on-primary active:scale-[0.96]"
          title={`Khởi chạy nhanh tất cả ứng dụng trong nhóm "${title}"`}
        >
          <Play size={11} weight="fill" />
          <span>Mở cả nhóm</span>
        </button>
      </div>
      <div className="h-[1px] flex-1 bg-gradient-to-r from-border/80 to-transparent" />
    </div>
  );
}
