import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash, WarningCircle } from '@phosphor-icons/react';
import { Item } from '../../api';

/** Huy hiệu nhỏ cho mục Lệnh / Script. */
function TypeBadge({ loai }: { loai: string }) {
  if (loai !== 'lenh' && loai !== 'script') return null;
  return (
    <span className="flex-shrink-0 rounded bg-primary/15 px-1 py-px font-mono text-[9px] font-semibold uppercase leading-none text-primary [text-shadow:none]">
      {loai === 'lenh' ? 'Lệnh' : 'Script'}
    </span>
  );
}

const MISSING_HINT = 'Tệp không còn tồn tại trên máy';

/** Click lần 2 trở đi (detail > 1): không để trình duyệt bôi chọn chữ, nhưng vẫn cho copy ở nơi khác. */
const preventDoubleClickSelect = (e: React.MouseEvent) => {
  if (e.detail > 1) e.preventDefault();
};

interface SortableListCardProps {
  item: Item;
  virtualRow: { size: number; start: number };
  sortDisabled: boolean;
  isLaunching: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  getIcon: (item: Item, size: 'sm' | 'md') => React.ReactNode;
  didDragRef: React.MutableRefObject<boolean>;
  onSelect: (id: string) => void;
  onLaunch: (item: Item) => void;
  onDelete: (item: Item) => void;
  onContextMenu: (e: React.MouseEvent, item: Item) => void;
}

export function SortableListCard({
  item,
  virtualRow,
  sortDisabled,
  isLaunching,
  isSelected,
  isDragOver,
  getIcon,
  didDragRef,
  onSelect,
  onLaunch,
  onDelete,
  onContextMenu,
}: SortableListCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: sortDisabled || isLaunching,
  });

  const sortableStyle = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualRow.size - 8}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div
        ref={setNodeRef}
        style={sortableStyle}
        {...attributes}
        {...listeners}
        onMouseDown={preventDoubleClickSelect}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          onSelect(item.id);
        }}
        onDoubleClick={() => {
          if (didDragRef.current) return;
          onLaunch(item);
        }}
        onContextMenu={(e) => onContextMenu(e, item)}
        title={item.ton_tai ? item.duong_dan : `${MISSING_HINT}: ${item.duong_dan}`}
        role="option"
        aria-selected={isSelected}
        className={`glass-card group flex h-full items-center justify-between gap-4 rounded-xl px-4 py-2 touch-none cursor-grab active:cursor-grabbing transition-[box-shadow,background-color,opacity] ${
          isLaunching
            ? 'animate-pulse-warm cursor-wait pointer-events-none'
            : 'glass-card-hover'
        } ${isSelected ? 'ring-2 ring-primary' : ''} ${
          isDragging ? 'opacity-30' : ''
        } ${isDragOver ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-glow' : ''}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 pointer-events-none select-none">
          <div
            className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-muted/60 text-primary transition-[box-shadow,background-color,opacity] group-hover:translate-y-[-1px] ${
              item.ton_tai ? '' : 'opacity-40 grayscale'
            }`}
          >
            {getIcon(item, 'sm')}
            {isLaunching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/75 backdrop-blur-[1px]">
                <div className="spinner-dual-container">
                  <div className="spinner-dual-outer" />
                  <div className="spinner-dual-inner" />
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-serif flex items-center gap-1.5 text-[14px] font-semibold leading-tight tracking-tight text-foreground">
              {!item.ton_tai && (
                <WarningCircle size={14} weight="fill" className="flex-shrink-0 text-destructive" />
              )}
              <span className="truncate">{item.ten}</span>
              <TypeBadge loai={item.loai} />
            </p>
            <p
              className={`mt-0.5 truncate font-mono text-[11px] ${
                item.ton_tai ? 'text-muted-foreground/70' : 'text-destructive/70'
              }`}
            >
              {item.ton_tai ? item.duong_dan : MISSING_HINT}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            className="icon-btn p-1.5 text-muted-foreground/40 opacity-0 transition-opacity duration-200 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Xóa mục"
          >
            <Trash size={15} weight="regular" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface SortableGridCardProps {
  item: Item;
  sortDisabled: boolean;
  isLaunching: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  getIcon: (item: Item, size: 'sm' | 'md') => React.ReactNode;
  didDragRef: React.MutableRefObject<boolean>;
  onSelect: (id: string) => void;
  onLaunch: (item: Item) => void;
  onDelete: (item: Item) => void;
  onContextMenu: (e: React.MouseEvent, item: Item) => void;
}

export function SortableGridCard({
  item,
  sortDisabled,
  isLaunching,
  isSelected,
  isDragOver,
  getIcon,
  didDragRef,
  onSelect,
  onLaunch,
  onDelete,
  onContextMenu,
}: SortableGridCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: sortDisabled || isLaunching,
  });

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseDown={preventDoubleClickSelect}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onSelect(item.id);
      }}
      onDoubleClick={() => {
        if (didDragRef.current) return;
        onLaunch(item);
      }}
      onContextMenu={(e) => onContextMenu(e, item)}
      title={item.ton_tai ? item.duong_dan : `${MISSING_HINT}: ${item.duong_dan}`}
      role="option"
      aria-selected={isSelected}
      className={`group relative flex touch-none cursor-grab flex-col items-center justify-center gap-2.5 rounded-2xl border border-border px-2 py-3 text-center transition-[background-color,border-color,box-shadow,opacity] duration-150 active:cursor-grabbing ${
        isLaunching
          ? 'animate-pulse-warm cursor-wait pointer-events-none'
          : 'hover:border-primary/70 hover:bg-primary/15 hover:backdrop-blur-md'
      } ${isSelected ? 'border-primary/70 bg-primary/25' : ''} ${
        isDragging ? 'opacity-30' : ''
      } ${isDragOver ? 'border-primary bg-primary/15 shadow-glow' : ''}`}
    >
      {/* Nút xóa: huy hiệu tròn, chỉ hiện khi hover */}
      <button
        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white/80 opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-destructive hover:text-white group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title="Xóa ứng dụng"
      >
        <Trash size={13} weight="regular" />
      </button>

      {/* Icon lớn, không khung */}
      <div
        className={`pointer-events-none relative flex h-16 w-16 select-none items-center justify-center overflow-hidden rounded-2xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] transition-transform duration-150 group-hover:scale-105 [&_img]:h-full [&_img]:w-full [&_img]:object-cover ${
          item.ton_tai ? '' : 'opacity-40 grayscale'
        }`}
      >
        {getIcon(item, 'md')}
        {isLaunching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div className="spinner-dual-container">
              <div className="spinner-dual-outer" />
              <div className="spinner-dual-inner" />
            </div>
          </div>
        )}
      </div>

      {/* Tên: sans, có bóng chữ để đọc được trên mọi ảnh nền */}
      <p className="pointer-events-none flex w-full select-none items-center justify-center gap-1 px-1 text-[13px] font-medium leading-tight text-foreground [text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">
        {!item.ton_tai && (
          <WarningCircle size={13} weight="fill" className="flex-shrink-0 text-destructive" />
        )}
        <span className="truncate">{item.ten}</span>
        <TypeBadge loai={item.loai} />
      </p>
    </div>
  );
}