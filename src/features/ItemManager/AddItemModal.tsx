import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, FileArrowUp } from '@phosphor-icons/react';

import { addGroup, getAllGroups, Group } from '../../api';
import { useNotification } from '../../context/NotificationContext';
import { addItemsToGroup, summarizeAddOutcome } from '../../utils/addItems';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialGroupId?: string;
}

import { open } from '@tauri-apps/plugin-dialog';

export function AddItemModal({ isOpen, onClose, onSuccess, initialGroupId }: AddItemModalProps) {
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast, confirm } = useNotification();

  const [itemPaths, setItemPaths] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || 'grp-default');
  /** Nhóm vừa tạo ở lần bấm trước (nếu thêm mục thất bại), để bấm lại không tạo nhóm trùng. */
  const createdGroupRef = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      getAllGroups()
        .then(setGroups)
        .catch((e) => {
          console.error(e);
          showToast(`Không tải được danh sách nhóm: ${String(e)}`, 'error');
        });
      if (initialGroupId) {
        setSelectedGroupId(initialGroupId);
      }
    }
  }, [isOpen, initialGroupId]);

  const handleSelectFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Ứng dụng hoặc Shortcut',
            extensions: ['exe', 'lnk', 'url']
          },
          {
            name: 'Tất cả các tệp',
            extensions: ['*']
          }
        ]
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        setItemPaths((prev) => [...prev, ...paths]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (itemPaths.length === 0) return;
    setIsSubmitting(true);
    try {
      let finalGroupId = selectedGroupId;
      if (isCreatingGroup && newGroupName.trim()) {
        const name = newGroupName.trim();
        if (createdGroupRef.current && createdGroupRef.current.name === name) {
          // Lần trước đã tạo nhóm này rồi (thêm mục lỗi) — dùng lại, không tạo trùng.
          finalGroupId = createdGroupRef.current.id;
        } else {
          const createdGroup = await addGroup(name);
          createdGroupRef.current = { id: createdGroup.id, name };
          finalGroupId = createdGroup.id;
          window.dispatchEvent(new CustomEvent('app-items-changed'));
        }
      }

      const outcome = await addItemsToGroup(itemPaths, finalGroupId, confirm);

      if (outcome.successCount > 0) {
        createdGroupRef.current = null;
        setItemPaths([]);
        setNewGroupName('');
        setIsCreatingGroup(false);
        setSelectedGroupId(initialGroupId || 'grp-default');
        onSuccess?.();
        onClose();
      }

      const summary = summarizeAddOutcome(outcome);
      if (summary) showToast(summary.message, summary.type);
    } catch (e) {
      console.error(e);
      showToast(String(e), 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-lg animate-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Thêm mục mới</h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} weight="regular" />
          </button>
        </div>

        <div className="custom-scrollbar max-h-[60vh] space-y-5 overflow-y-auto p-6">
          {/* File Selection */}
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tệp / Đường dẫn
            </label>
            <button
              onClick={handleSelectFiles}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-muted/20 py-6 text-sm font-medium text-primary/80 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              <FileArrowUp size={20} weight="regular" />
              Chọn tệp từ máy tính
            </button>
            {itemPaths.length > 0 && (
              <div className="mt-3 space-y-2">
                {itemPaths.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-xs text-foreground">
                    <FileArrowUp size={14} weight="regular" className="text-primary" />
                    <span className="flex-1 truncate">{p}</span>
                    <button onClick={() => setItemPaths(itemPaths.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <X size={14} weight="regular" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group Selection */}
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Phân loại nhóm
            </label>
            {!isCreatingGroup ? (
              <div className="flex gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="input-base flex-1 appearance-none"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-card text-foreground">
                      {g.id === 'grp-default' ? 'Mặc định (Chung)' : g.ten}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCreatingGroup(true)}
                  className="btn-ghost border border-border/80"
                  title="Tạo nhóm mới"
                >
                  <Plus size={18} weight="regular" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={newGroupName}
                    maxLength={30}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Tên nhóm mới..."
                    className="input-base w-full pr-14"
                    autoFocus
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground/60">
                    {newGroupName.length}/30
                  </span>
                </div>
                <button onClick={() => setIsCreatingGroup(false)} className="btn-ghost border border-border/80">
                  Hủy
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="btn-ghost">
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || itemPaths.length === 0}
            className="btn-primary"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Thêm vào Menu'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}