import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { getAllGroups, scanShortcuts, Group, ScanCandidate } from '../../api';
import { useNotification } from '../../context/NotificationContext';
import { addItemsToGroup, summarizeAddOutcome } from '../../utils/addItems';
import { normalize } from '../../utils/search';

interface ScanShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialGroupId?: string;
}

const NGUON_LABEL: Record<ScanCandidate['nguon'], string> = {
  desktop: 'Desktop',
  startmenu: 'Start Menu',
};

/** Quét Desktop / Start Menu (chỉ đọc) và thêm các ứng dụng được chọn vào một nhóm. */
export function ScanShortcutsModal({ isOpen, onClose, onSuccess, initialGroupId }: ScanShortcutsModalProps) {
  const { showToast, confirm } = useNotification();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState(initialGroupId || 'grp-default');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setFilter('');
    setProgress(null);
    if (initialGroupId) setGroupId(initialGroupId);
    getAllGroups().then(setGroups).catch((e) => console.error(e));
    setLoading(true);
    scanShortcuts()
      .then(setCandidates)
      .catch((e) => showToast(`Không quét được: ${String(e)}`, 'error'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const visible = useMemo(() => {
    const q = normalize(filter.trim());
    if (!q) return candidates;
    return candidates.filter((c) => normalize(`${c.ten} ${c.thu_muc_con}`).includes(q));
  }, [candidates, filter]);

  /** Nhóm theo nguồn rồi theo thư mục con. */
  const sections = useMemo(() => {
    const map = new Map<string, ScanCandidate[]>();
    for (const c of visible) {
      const key = c.thu_muc_con ? `${NGUON_LABEL[c.nguon]} › ${c.thu_muc_con}` : NGUON_LABEL[c.nguon];
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [visible]);

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const selectAllVisible = () => setSelected((prev) => new Set([...prev, ...visible.map((c) => c.duong_dan)]));
  const clearAll = () => setSelected(new Set());

  const handleAdd = async () => {
    const paths = candidates.filter((c) => selected.has(c.duong_dan)).map((c) => c.duong_dan);
    if (paths.length === 0) return;
    setProgress({ done: 0, total: paths.length });
    try {
      const outcome = await addItemsToGroup(paths, groupId, confirm, (done, total) => setProgress({ done, total }));
      const summary = summarizeAddOutcome(outcome);
      if (summary) showToast(summary.message, summary.type);
      if (outcome.successCount > 0) {
        onSuccess?.();
        onClose();
      }
    } catch (e) {
      showToast(String(e), 'warning');
    } finally {
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel flex max-h-[85vh] w-full max-w-2xl animate-modal-in flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-serif text-lg font-semibold tracking-tight">Quét máy tìm ứng dụng</h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} weight="regular" />
          </button>
        </div>

        <div className="space-y-3 border-b border-border/60 px-6 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Lọc theo tên..."
              className="input-base flex-1"
            />
            <button onClick={selectAllVisible} className="btn-ghost border border-border/80 text-xs">
              Chọn tất cả
            </button>
            <button onClick={clearAll} className="btn-ghost border border-border/80 text-xs">
              Bỏ chọn
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Chỉ đọc Desktop và Start Menu — không di chuyển hay xoá tệp nào. Đã bỏ qua các mục có trong menu, trình gỡ cài đặt và tệp trợ giúp.
          </p>
        </div>

        <div className="custom-scrollbar min-h-[200px] flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Đang quét...</p>
          ) : sections.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Không có ứng dụng mới nào để thêm.</p>
          ) : (
            sections.map(([title, list]) => (
              <div key={title} className="mb-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {title} ({list.length})
                </div>
                {list.map((c) => (
                  <label
                    key={c.duong_dan}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
                    title={c.duong_dan}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.duong_dan)}
                      onChange={() => toggle(c.duong_dan)}
                      className="accent-primary"
                    />
                    <span className="truncate">{c.ten}</span>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="input-base max-w-[200px] appearance-none"
            title="Nhóm đích"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id} className="bg-card text-foreground">
                {g.id === 'grp-default' ? 'Mặc định (Chung)' : g.ten}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {progress ? `Đang thêm ${progress.done}/${progress.total}...` : `Đã chọn ${selected.size}`}
          </span>
          <div className="ml-auto flex gap-3">
            <button onClick={onClose} className="btn-ghost">
              Đóng
            </button>
            <button onClick={handleAdd} disabled={selected.size === 0 || progress !== null} className="btn-primary">
              Thêm {selected.size > 0 ? `${selected.size} mục` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
