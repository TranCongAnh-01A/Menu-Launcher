import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, DotsSixVertical, Pencil, Trash, Check } from '@phosphor-icons/react';
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
import { getAllGroups, renameGroup, reorderGroups, deleteGroup, Group } from '../../api';
import { useNotification } from '../../context/NotificationContext';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function SortableItem({
  group,
  onRename,
  onDelete,
}: {
  group: Group;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.ten);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  const { showToast } = useNotification();

  const handleSave = () => {
    if (!editName.trim()) {
      showToast('Tên nhóm không được để trống', 'warning');
      setEditName(group.ten);
    } else if (editName.trim() !== group.ten) {
      onRename(group.id, editName.trim());
    } else {
      setEditName(group.ten);
    }
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card group flex items-center gap-3 rounded-xl px-3 py-2.5 ${isDragging ? 'shadow-glow ring-2 ring-primary/20' : ''
        }`}
    >
      <button
        className="cursor-grab touch-none p-1 text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DotsSixVertical size={18} weight="regular" />
      </button>

      {isEditing ? (
        <input
          type="text"
          value={editName}
          maxLength={30}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="input-base flex-1 py-1 text-sm"
          autoFocus
        />
      ) : (
        <span className="flex-1 truncate text-sm font-medium text-foreground" title={group.ten}>
          {group.ten}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isEditing ? (
          <button onClick={handleSave} className="icon-btn text-primary">
            <Check size={16} weight="regular" />
          </button>
        ) : (
          <button onClick={() => setIsEditing(true)} className="icon-btn">
            <Pencil size={16} weight="regular" />
          </button>
        )}
        {group.id !== 'grp-default' && (
          <button onClick={() => onDelete(group.id)} className="icon-btn text-destructive hover:bg-destructive/10">
            <Trash size={16} weight="regular" />
          </button>
        )}
      </div>
    </div>
  );
}

export function GroupManagerModal({ isOpen, onClose, onSuccess }: GroupManagerModalProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const { confirm, showToast } = useNotification();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchGroups = async () => {
    try {
      const data = await getAllGroups();
      setGroups(data);
    } catch (e) {
      console.error(e);
      showToast(`Không tải được danh sách nhóm: ${String(e)}`, 'error');
    }
  };

  useEffect(() => {
    if (isOpen) fetchGroups();
  }, [isOpen]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((g) => g.id === active.id);
      const newIndex = groups.findIndex((g) => g.id === over.id);
      const newGroups = arrayMove(groups, oldIndex, newIndex);
      setGroups(newGroups);
      try {
        await reorderGroups(newGroups.map((g) => g.id));
        onSuccess?.();
      } catch (e) {
        console.error(e);
        showToast(`Không lưu được thứ tự nhóm: ${String(e)}`, 'error');
        fetchGroups();
      }
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameGroup(id, newName);
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ten: newName } : g)));
      onSuccess?.();
    } catch (e) {
      console.error(e);
      showToast(`Không đổi được tên nhóm: ${String(e)}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm('Bạn có chắc muốn xóa nhóm này? Toàn bộ các ứng dụng trong nhóm cũng sẽ bị xóa vĩnh viễn.');
    if (confirmed) {
      try {
        await deleteGroup(id, 'xoa');
        setGroups((prev) => prev.filter((g) => g.id !== id));
        window.dispatchEvent(new CustomEvent('app-items-changed'));
        onSuccess?.();
      } catch (e) {
        console.error(e);
        showToast(`Không xóa được nhóm: ${String(e)}`, 'error');
      }
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-md animate-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Quản lý nhóm</h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} weight="regular" />
          </button>
        </div>

        <div className="custom-scrollbar max-h-[60vh] space-y-2 overflow-y-auto p-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              {groups.map((group) => (
                <SortableItem
                  key={group.id}
                  group={group}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-end border-t border-border px-6 py-4">
          <button onClick={onClose} className="btn-primary">
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}