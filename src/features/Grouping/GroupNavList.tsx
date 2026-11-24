import { useEffect, useState, lazy } from 'react';
import { SquaresFour, FolderOpen, Plus, SlidersHorizontal, Fire, ClockCounterClockwise, Play, Rocket } from '@phosphor-icons/react';
import { launchWorkspace } from '../../api';
import { useNotification } from '../../context/NotificationContext';
import { summarizeLaunchResult } from '../../utils/launch';
import { useLauncherData } from '../../context/LauncherDataContext';
import { CreateGroupModal } from './CreateGroupModal';
import { LazyMount } from '../../components/LazyMount';
import { HAY_DUNG_ID, GAN_DAY_ID, topUsed, recentlyUsed } from '../../utils/virtualGroups';

const WorkspaceManagerModal = lazy(() => import('../Workspace/WorkspaceManagerModal').then((m) => ({ default: m.WorkspaceManagerModal })));
const GroupManagerModal = lazy(() => import('./GroupManagerModal').then((m) => ({ default: m.GroupManagerModal })));

export function GroupNavList() {
  const { items, workspaces, defaultGroup, customGroups, activeGroupId, selectGroup, refresh } = useLauncherData();
  const { showToast } = useNotification();
  const [wsManagerOpen, setWsManagerOpen] = useState(false);
  const [wsManagerInitial, setWsManagerInitial] = useState<string | null>(null);
  const [runningWsId, setRunningWsId] = useState<string | null>(null);

  const openWsManager = (id: string | null) => {
    setWsManagerInitial(id);
    setWsManagerOpen(true);
  };

  const handleRunWorkspace = async (id: string, ten: string) => {
    if (runningWsId) return;
    setRunningWsId(id);
    showToast(`Đang chạy workspace "${ten}"...`, 'info');
    try {
      const summary = summarizeLaunchResult(await launchWorkspace(id));
      showToast(summary.message, summary.type);
      refresh(); // cập nhật số lần mở
    } catch (e) {
      console.error(e);
      showToast(`Lỗi khi chạy workspace: ${String(e)}`, 'error');
    } finally {
      setRunningWsId(null);
    }
  };
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // Giữ nhóm đang chọn luôn nằm trong tầm nhìn khi danh sách dài
  useEffect(() => {
    document.getElementById(`tab-group-${activeGroupId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeGroupId]);

  const countOf = (groupId: string) => items.filter((i) => i.nhom_id === groupId).length;

  const renderRow = (
    id: string,
    label: string,
    count: number,
    droppable: boolean,
    isAll = false,
    IconOverride?: typeof FolderOpen
  ) => {
    const isActive = activeGroupId === id;
    const Icon = IconOverride ?? (isAll ? SquaresFour : FolderOpen);
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
        {renderRow(HAY_DUNG_ID, 'Hay dùng', topUsed(items).length, false, false, Fire)}
        {renderRow(GAN_DAY_ID, 'Gần đây', recentlyUsed(items).length, false, false, ClockCounterClockwise)}
        {defaultGroup && renderRow('grp-default', defaultGroup.ten || 'Mặc định', countOf('grp-default'), true)}
        {customGroups.map((g) => renderRow(g.id, g.ten, countOf(g.id), true))}

        {/* Workspace: nút ▶ chạy tuần tự các mục, bấm tên để chỉnh sửa */}
        <div className="flex items-center justify-between pb-0.5 pl-1 pr-0 pt-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Workspace</h3>
          <button onClick={() => openWsManager(null)} className="icon-btn p-1.5" title="Quản lý workspace">
            <SlidersHorizontal size={14} weight="regular" />
          </button>
        </div>
        {workspaces.length === 0 && (
          <button
            onClick={() => openWsManager(null)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/80"
          >
            <Plus size={14} weight="bold" /> Tạo workspace
          </button>
        )}
        {workspaces.map((w) => (
          <div
            key={w.id}
            className="flex items-center gap-1 rounded-xl px-1 text-sm font-medium text-foreground/70 hover:bg-muted/80 hover:text-foreground"
          >
            <button
              onClick={() => openWsManager(w.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 py-2 text-left"
              title={`Chỉnh sửa "${w.ten}"`}
            >
              <Rocket size={16} className="flex-shrink-0" />
              <span className="truncate">{w.ten}</span>
              <span className="ml-auto flex-shrink-0 rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {w.muc_ids.length}
              </span>
            </button>
            <button
              onClick={() => handleRunWorkspace(w.id, w.ten)}
              disabled={runningWsId !== null || w.muc_ids.length === 0}
              className="icon-btn p-1.5 text-primary disabled:opacity-40"
              title={`Chạy workspace "${w.ten}"`}
            >
              <Play size={14} weight="fill" className={runningWsId === w.id ? 'animate-pulse' : ''} />
            </button>
          </div>
        ))}
      </div>

      <CreateGroupModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={refresh} />
      <LazyMount open={wsManagerOpen}>
        <WorkspaceManagerModal isOpen={wsManagerOpen} initialId={wsManagerInitial} onClose={() => setWsManagerOpen(false)} />
      </LazyMount>
      <LazyMount open={isManagerOpen}>
        <GroupManagerModal isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} onSuccess={refresh} />
      </LazyMount>
    </div>
  );
}