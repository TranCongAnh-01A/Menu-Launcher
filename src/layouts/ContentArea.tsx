import { useState, useEffect, useMemo, useRef, lazy } from 'react';
import { MagnifyingGlass, SquaresFour, ListBullets, Play } from '@phosphor-icons/react';
import { MenuViewer } from '../features/MenuViewer/MenuViewer';
import { launchItems, hideWindow, logFrontendError } from '../api';
import { useNotification } from '../context/NotificationContext';
import { useLauncherData } from '../context/LauncherDataContext';
import { summarizeLaunchResult } from '../utils/launch';
import { hasOpenOverlay, FOCUS_SEARCH_EVENT } from '../utils/overlay';
import { LazyMount } from '../components/LazyMount';
import { searchItems } from '../utils/search';
import { HAY_DUNG_ID, GAN_DAY_ID, isVirtualGroup, topUsed, recentlyUsed, realGroupOrDefault } from '../utils/virtualGroups';

const AddItemModal = lazy(() => import('../features/ItemManager/AddItemModal').then((m) => ({ default: m.AddItemModal })));

export function ContentArea() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLaunchingAll, setIsLaunchingAll] = useState(false);
  const { showToast } = useNotification();
  const { groups, items, activeGroupId, activeGroup, refresh } = useLauncherData();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('app_view_mode') as 'grid' | 'list') || 'grid'
  );

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('app_view_mode', mode);
  };

  // Ô tìm kiếm là điểm vào bàn phím: focus sẵn khi mở, và mỗi lần cửa sổ được
  // gọi lên bằng phím tắt toàn cục.
  useEffect(() => {
    const focusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    focusSearch();
    window.addEventListener(FOCUS_SEARCH_EVENT, focusSearch);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focusSearch);
  }, []);

  // Escape: xoá từ khoá trước, không còn gì để xoá thì ẩn cửa sổ.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || hasOpenOverlay()) return;
      e.preventDefault();
      if (searchTerm) {
        setSearchTerm('');
        searchInputRef.current?.focus();
      } else {
        hideWindow().catch((err) => {
          console.error('Lỗi khi ẩn cửa sổ:', err);
          logFrontendError(`hideWindow that bai: ${String(err)}`);
          showToast(`Không ẩn được cửa sổ: ${String(err)}`, 'error');
        });
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [searchTerm]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (activeGroupId === HAY_DUNG_ID) list = topUsed(items);
    else if (activeGroupId === GAN_DAY_ID) list = recentlyUsed(items);
    else if (activeGroupId !== 'tatca') {
      list = list.filter((i) => i.nhom_id === activeGroupId);
    }
    // Có từ khoá: trả về theo thứ tự xếp hạng (không theo nhóm).
    if (searchTerm.trim()) list = searchItems(list, searchTerm);
    return list;
  }, [items, activeGroupId, searchTerm]);

  const handleLaunchAll = async () => {
    if (activeGroupId === 'tatca' || isVirtualGroup(activeGroupId) || visibleItems.length === 0) return;
    setIsLaunchingAll(true);
    showToast(`Đang khởi chạy ${visibleItems.length} ứng dụng trong nhóm "${activeGroup.ten}"...`, 'info');
    try {
      // Gửi đúng danh sách đang hiển thị (đã lọc theo ô tìm kiếm), để số chạy
      // khớp với số ghi trên nút.
      const result = await launchItems(visibleItems.map((i) => i.id));
      const summary = summarizeLaunchResult(result);
      showToast(summary.message, summary.type);
      refresh(); // cập nhật số lần mở
    } catch (e) {
      console.error(e);
      showToast(`Lỗi khi khởi chạy nhóm: ${String(e)}`, 'error');
    } finally {
      setIsLaunchingAll(false);
    }
  };

  return (
    <main className="glass-panel relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl animate-fade-in">
      {/* Header */}
      <header className="flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b border-border px-5 animate-fade-down">
        <div className="group relative w-full max-w-md">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors duration-300 group-focus-within:text-primary"
          />
          <input
            ref={searchInputRef}
            data-launcher-search
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm — mũi tên để chọn, Enter để mở"
            className="w-full rounded-xl border border-border/70 bg-card/70 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 transition-all duration-300 ease-smooth focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <div className="flex items-center gap-2">
          {activeGroupId !== 'tatca' && !isVirtualGroup(activeGroupId) && visibleItems.length > 0 && (
            <button
              onClick={handleLaunchAll}
              disabled={isLaunchingAll}
              className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary hover:text-on-primary active:scale-[0.98] cursor-pointer shadow-sm disabled:opacity-50"
              title={`Khởi chạy toàn bộ ${visibleItems.length} ứng dụng trong nhóm "${activeGroup.ten}"`}
            >
              <Play size={13} weight="fill" className={isLaunchingAll ? 'animate-spin' : ''} />
              <span>{isLaunchingAll ? 'Đang mở...' : `Mở tất cả (${visibleItems.length})`}</span>
            </button>
          )}

          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={`flex items-center justify-center rounded-lg p-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'grid' ? 'bg-primary text-on-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Chế độ Lưới (Grid)"
            >
              <SquaresFour size={16} weight={viewMode === 'grid' ? 'fill' : 'regular'} />
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`flex items-center justify-center rounded-lg p-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'list' ? 'bg-primary text-on-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Chế độ Danh sách (List)"
            >
              <ListBullets size={16} weight={viewMode === 'list' ? 'bold' : 'regular'} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div key={`${activeGroupId}-${viewMode}`} className="flex min-h-0 flex-1 animate-fade-in">
        <MenuViewer
          items={visibleItems}
          groups={groups}
          activeGroupId={activeGroupId}
          viewMode={viewMode}
          searchTerm={searchTerm}
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />
      </div>

      <LazyMount open={isAddModalOpen}>
        <AddItemModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={refresh}
          initialGroupId={realGroupOrDefault(activeGroupId)}
        />
      </LazyMount>
    </main>
  );
}