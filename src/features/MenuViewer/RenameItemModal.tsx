import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Item, renameItem } from '../../api';

interface RenameItemModalProps {
  item: Item;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onClose: () => void;
}

/** Modal đổi tên hiển thị của một mục (không đổi tên file gốc). */
export function RenameItemModal({ item, showToast, onClose }: RenameItemModalProps) {
  const [renameInput, setRenameInput] = useState(item.ten);

  const handleSaveRename = async () => {
    const cleanName = renameInput.trim();
    if (!cleanName) {
      showToast('Tên ứng dụng không được để trống', 'warning');
      return;
    }
    try {
      await renameItem(item.id, cleanName);
      window.dispatchEvent(new CustomEvent('app-items-changed'));
      showToast('Đã đổi tên hiển thị thành công', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi đổi tên ứng dụng', 'error');
    }
  };

  return createPortal(

          <div className="modal-backdrop flex items-center justify-center p-4" onClick={() => onClose()}>
            <div className="modal-panel w-full max-w-sm p-6 animate-modal-in" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-serif text-lg font-bold tracking-tight text-foreground mb-2">
                Đổi tên hiển thị
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Chỉ thay đổi tên hiển thị trong Menu Launcher, không làm đổi tên file gốc trên máy tính.
              </p>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-border bg-card/70 px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 mb-5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') onClose();
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => onClose()}
                  className="btn-ghost text-xs px-4 py-2 border border-border"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveRename}
                  className="btn-primary text-xs px-4 py-2"
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>,
    document.body
  );
}
