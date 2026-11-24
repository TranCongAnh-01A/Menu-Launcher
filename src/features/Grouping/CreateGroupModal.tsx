import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen } from '@phosphor-icons/react';
import { addGroup } from '../../api';
import { useNotification } from '../../context/NotificationContext';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateGroupModal({ isOpen, onClose, onSuccess }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useNotification();

  const handleCreate = async () => {
    if (!groupName.trim()) {
      showToast('Tên nhóm không được để trống', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await addGroup(groupName.trim());
      setGroupName('');
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error(e);
      showToast(`Không tạo được nhóm: ${String(e)}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Tạo nhóm mới</h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} weight="regular" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderOpen size={24} weight="regular" />
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Nhóm giúp bạn phân loại và tìm kiếm ứng dụng nhanh hơn.
          </p>
          <div className="relative">
            <input
              type="text"
              value={groupName}
              maxLength={30}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Ví dụ: Công việc, Giải trí..."
              className="input-base pr-14"
              autoFocus
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground/60">
              {groupName.length}/30
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="btn-ghost">
            Hủy
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !groupName.trim()}
            className="btn-primary"
          >
            Tạo nhóm
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}