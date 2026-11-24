import { useEffect, useState, lazy } from 'react';
import { SquaresFour, FolderOpen, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { useLauncherData } from '../../context/LauncherDataContext';
import { CreateGroupModal } from './CreateGroupModal';
import { LazyMount } from '../../components/LazyMount';

const GroupManagerModal = lazy(() => import('./GroupManagerModal').then((m) => ({ default: m.GroupManagerModal })));

export function GroupNavList() {
  const { items, defaultGroup, customGroups, activeGroupId, selectGroup, refresh } = useLauncherData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // Giữ nhóm đang chọn luôn nằm trong tầm nhìn khi danh sách dài
  useEffect(() => {
    document.getElementById(`tab-group-${activeGroupId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeGroupId]);

  const countOf = (groupId: string) => items.filter((i) => i.nhom_id === groupId).length;

  const renderRow = (id: string, label: string, count: number, droppable: boolean, isAll = false) => {
    const isActive = activeGroupId === id;
    const Icon = isAll ? SquaresFour : FolderOpen;
    return (
      <button
        key={id}
        id={`tab-group-${id}`}
        onClick={() => selectGroup(id)}
        // MenuViewer (dnd-kit) tìm nút này theo toạ độ con trỏ khi thả; highlight
        // (ring-2 ring-primary bg-primary/10) cũng do MenuViewer bật/tắt.
        data-drop-group-id={droppable ? id : undefined}
        title={label}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors active:scale-[0.98] ${
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-foreground/70 hover:bg-muted/80 hover:text-foreground'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon size={16} weight={isActive ? 'fill' : 'regular'} className="flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span
          className={`flex-shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
            isActive ? 'bg-primary/20 text-primary' : 'bg-muted/80 text-muted-foreground'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Nhóm</h3>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setIsCreateOpen(true)} className="icon-btn p-1.5" title="Tạo nhóm">
            <Plus size={14} weight="bold" />
          </button>
          <button onClick={() => setIsManagerOpen(true)} className="icon-btn p-1.5" title="Quản lý & sắp xếp nhóm">
            <SlidersHorizontal size={14} weight="regular" />
          </button>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {renderRow('tatca', 'Tất cả', items.length, false, true)}
        {defaultGroup && renderRow('grp-default', defaultGroup.ten || 'Mặc định', countOf('grp-default'), true)}
        {customGroups.map((g) => renderRow(g.id, g.ten, countOf(g.id), true))}
      </div>

      <CreateGroupModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={refresh} />
      <LazyMount open={isManagerOpen}>
        <GroupManagerModal isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} onSuccess={refresh} />
      </LazyMount>
    </div>
  );
}