import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { Item, updateItemDetails } from '../../api';
import { ItemDetailsForm, ItemFormValue, CustomLoai } from './ItemDetailsForm';

interface EditItemModalProps {
  item: Item;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onClose: () => void;
}

const CUSTOM = ['lenh', 'script', 'link'];

/** Sửa mục: mục nâng cao (lenh/script/link) đủ trường; mục thường chỉ tên + đường dẫn. */
export function EditItemModal({ item, showToast, onClose }: EditItemModalProps) {
  const isCustom = CUSTOM.includes(item.loai);
  const [form, setForm] = useState<ItemFormValue>({
    ten: item.ten,
    loai: (isCustom ? item.loai : 'lenh') as CustomLoai,
    duong_dan: item.duong_dan,
    tham_so: item.tham_so,
    thu_muc_lam_viec: item.thu_muc_lam_viec,
    trinh_duyet: item.trinh_duyet,
    an_console: item.an_console,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.ten.trim()) {
      showToast('Tên không được để trống', 'warning');
      return;
    }
    setSaving(true);
    try {
      await updateItemDetails(item.id, { ...form, loai: isCustom ? form.loai : undefined });
      window.dispatchEvent(new CustomEvent('app-items-changed'));
      showToast('Đã lưu thay đổi', 'success');
      onClose();
    } catch (e) {
      showToast(String(e), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-lg animate-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Sửa mục</h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} weight="regular" />
          </button>
        </div>
        <div className="custom-scrollbar max-h-[60vh] overflow-y-auto p-6">
          <ItemDetailsForm value={form} onChange={setForm} showLoaiTabs={isCustom} simple={!isCustom} />
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="btn-ghost">
            Hủy bỏ
          </button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
