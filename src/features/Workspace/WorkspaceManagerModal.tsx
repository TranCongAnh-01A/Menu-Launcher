import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, DotsSixVertical, Trash, Plus, MagnifyingGlass, Rocket } from '@phosphor-icons/react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  addWorkspace,
  updateWorkspace,
  deleteWorkspace,
  reorderWorkspaces,
  Item,
  Workspace,
} from '../../api';
import { useLauncherData } from '../../context/LauncherDataContext';
import { useNotification } from '../../context/NotificationContext';
import { searchItems } from '../../utils/search';

interface WorkspaceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Workspace được chọn sẵn khi mở. */
  initialId?: string | null;
}

const MAX_DELAY_S = 10;

function ItemIcon({ item }: { item: Item }) {
  return item.icon_cache ? (
    <img src={convertFileSrc(item.icon_cache)} alt="" className="h-5 w-5 flex-shrink-0 object-contain" draggable={false} />
  ) : (
    <div className="h-5 w-5 flex-shrink-0 rounded bg-muted" />
  );
}

/** Hàng workspace ở cột trái (kéo để sắp xếp). */
function SortableWorkspaceRow({
  ws,
  active,
  onSelect,
}: {
  ws: Workspace;
  active: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ws.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 }}
      className={`flex items-center gap-1 rounded-xl px-1.5 py-1.5 text-sm ${
        active ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-muted/80'
      }`}
    >
      <button
        className="cursor-grab touch-none p-0.5 text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        title="Kéo để sắp xếp"
      >
        <DotsSixVertical size={14} />
      </button>
      <button onClick={onSelect} className="min-w-0 flex-1 truncate text-left font-medium" title={ws.ten}>
        {ws.ten}
      </button>
    </div>
  );
}

/** Hàng mục đã chọn ở cột giữa (kéo để đổi thứ tự mở). */
function SortableMemberRow({
  item,
  index,
  onRemove,
}: {
  item: Item;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 }}
      className="glass-card flex items-center gap-2 rounded-xl px-2 py-1.5"
    >
      <button
        className="cursor-grab touch-none p-0.5 text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DotsSixVertical size={16} />
      </button>
      <span className="w-5 text-center font-mono text-[10px] text-muted-foreground">{index + 1}</span>
      <ItemIcon item={item} />
      <span className="min-w-0 flex-1 truncate text-sm" title={item.duong_dan}>
        {item.ten}
      </span>
      <button onClick={onRemove} className="icon-btn p-1" title="Bỏ khỏi workspace">
        <X size={14} />
      </button>
    </div>
  );
}

export function WorkspaceManagerModal({ isOpen, onClose, initialId }: WorkspaceManagerModalProps) {
  const { items, workspaces, refresh } = useLauncherData();
  const { confirm, showToast } = useNotification();

  const [list, setList] = useState<Workspace[]>(workspaces);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [delayMs, setDelayMs] = useState(500);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const loadInto = (ws: Workspace | undefined) => {
    setSelectedId(ws?.id ?? null);
    setName(ws?.ten ?? '');
    // Bỏ id mục đã bị xoá (backend cũng đã gỡ, đây chỉ là phòng hờ).
    setMemberIds((ws?.muc_ids ?? []).filter((id) => itemById.has(id)));
    setDelayMs(ws?.do_tre_ms ?? 500);
    setDirty(false);
    setQuery('');
  };

  // Mở modal: nạp danh sách + chọn workspace ban đầu (hoặc cái đầu tiên).
  useEffect(() => {
    if (!isOpen) return;
    setList(workspaces);
    loadInto(workspaces.find((w) => w.id === initialId) ?? workspaces[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const markDirty = () => setDirty(true);

  /** Lưu bản nháp hiện tại (nếu có thay đổi). Trả về false khi lỗi. */
  const saveDraft = async (): Promise<boolean> => {
    if (!selectedId || !dirtyRef.current) return true;
    if (!name.trim()) {
      showToast('Tên workspace không được để trống', 'warning');
      return false;
    }
    try {
      await updateWorkspace(selectedId, name.trim(), memberIds, delayMs);
      setList((prev) =>
        prev.map((w) => (w.id === selectedId ? { ...w, ten: name.trim(), muc_ids: memberIds, do_tre_ms: delayMs } : w))
      );
      setDirty(false);
      await refresh();
      return true;
    } catch (e) {
      showToast(`Không lưu được workspace: ${String(e)}`, 'error');
      return false;
    }
  };

  const handleSelect = async (ws: Workspace) => {
    if (ws.id === selectedId) return;
    if (!(await saveDraft())) return;
    // Lấy bản mới nhất trong `list` (vừa được saveDraft cập nhật).
    loadInto(list.find((w) => w.id === ws.id) ?? ws);
  };

  const handleClose = async () => {
    if (await saveDraft()) onClose();
  };

  const handleCreate = async () => {
    const ten = newName.trim();
    if (!ten) return;
    if (!(await saveDraft())) return;
    try {
      const ws = await addWorkspace(ten);
      setList((prev) => [...prev, ws]);
      setNewName('');
      loadInto(ws);
      await refresh();
    } catch (e) {
      showToast(`Không tạo được workspace: ${String(e)}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirm(`Xoá workspace "${name}"? Các mục bên trong không bị xoá.`))) return;
    try {
      await deleteWorkspace(selectedId);
      const rest = list.filter((w) => w.id !== selectedId);
      setList(rest);
      loadInto(rest[0]);
      await refresh();
    } catch (e) {
      showToast(`Không xoá được workspace: ${String(e)}`, 'error');
    }
  };

  const handleWorkspaceDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      list,
      list.findIndex((w) => w.id === active.id),
      list.findIndex((w) => w.id === over.id)
    );
    setList(next);
    try {
      await reorderWorkspaces(next.map((w) => w.id));
      await refresh();
    } catch (e) {
      showToast(`Không lưu được thứ tự workspace: ${String(e)}`, 'error');
    }
  };

  const handleMemberDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setMemberIds((prev) =>
      arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)))
    );
    markDirty();
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    markDirty();
  };

  const members = memberIds.map((id) => itemById.get(id)).filter((i): i is Item => !!i);
  const pickerItems = useMemo(() => searchItems(items, query), [items, query]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={handleClose}>
      <div className="modal-panel flex max-h-[85vh] w-full max-w-4xl flex-col animate-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Quản lý Workspace</h2>
          <button onClick={handleClose} className="icon-btn">
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5 md:flex-row">
          {/* Cột trái: danh sách workspace */}
          <div className="flex w-full flex-shrink-0 flex-col gap-2 md:w-48">
            <div className="custom-scrollbar max-h-40 space-y-0.5 overflow-y-auto md:max-h-none md:flex-1">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleWorkspaceDragEnd}>
                <SortableContext items={list.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                  {list.map((w) => (
                    <SortableWorkspaceRow key={w.id} ws={w} active={w.id === selectedId} onSelect={() => handleSelect(w)} />
                  ))}
                </SortableContext>
              </DndContext>
              {list.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">Chưa có workspace. Tạo mới bên dưới.</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newName}
                maxLength={50}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Tên workspace mới"
                className="input-base min-w-0 flex-1 py-1.5 text-sm"
              />
              <button onClick={handleCreate} disabled={!newName.trim()} className="icon-btn" title="Tạo workspace">
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>

          {selectedId ? (
            <>
              {/* Cột giữa: tên, độ trễ, mục đã chọn theo thứ tự mở */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    maxLength={50}
                    onChange={(e) => {
                      setName(e.target.value);
                      markDirty();
                    }}
                    className="input-base min-w-0 flex-1 py-1.5 text-sm font-medium"
                    placeholder="Tên workspace"
                  />
                  <button onClick={handleDelete} className="icon-btn text-destructive hover:bg-destructive/10" title="Xoá workspace">
                    <Trash size={16} />
                  </button>
                </div>

                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">Độ trễ giữa các app</span>
                  <input
                    type="range"
                    min={0}
                    max={MAX_DELAY_S * 1000}
                    step={100}
                    value={delayMs}
                    onChange={(e) => {
                      setDelayMs(Number(e.target.value));
                      markDirty();
                    }}
                    className="flex-1 accent-[var(--primary,currentColor)]"
                  />
                  <span className="w-10 text-right font-mono text-foreground">{(delayMs / 1000).toFixed(1)}s</span>
                </label>

                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Thứ tự mở ({members.length})
                </p>
                <div className="custom-scrollbar min-h-[120px] flex-1 space-y-1.5 overflow-y-auto">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMemberDragEnd}>
                    <SortableContext items={memberIds} strategy={verticalListSortingStrategy}>
                      {members.map((it, idx) => (
                        <SortableMemberRow key={it.id} item={it} index={idx} onRemove={() => toggleMember(it.id)} />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {members.length === 0 && (
                    <p className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
                      <Rocket size={16} /> Chọn mục ở cột bên phải để thêm vào workspace.
                    </p>
                  )}
                </div>
              </div>

              {/* Cột phải: chọn mục từ mọi nhóm */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                <div className="relative">
                  <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tìm mục để thêm..."
                    className="input-base w-full py-1.5 pl-8 text-sm"
                  />
                </div>
                <div className="custom-scrollbar min-h-[120px] flex-1 space-y-0.5 overflow-y-auto">
                  {pickerItems.map((it) => (
                    <label
                      key={it.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/80"
                    >
                      <input type="checkbox" checked={memberIds.includes(it.id)} onChange={() => toggleMember(it.id)} />
                      <ItemIcon item={it} />
                      <span className="min-w-0 flex-1 truncate" title={it.duong_dan}>
                        {it.ten}
                      </span>
                    </label>
                  ))}
                  {pickerItems.length === 0 && (
                    <p className="px-2 py-4 text-xs text-muted-foreground">Không có mục nào khớp.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Chọn hoặc tạo một workspace để chỉnh sửa.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
          <div className="flex gap-3">
            <button onClick={saveDraft} disabled={!dirty} className="btn-ghost">
              Lưu
            </button>
            <button onClick={handleClose} className="btn-primary">
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
