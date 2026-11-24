import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableGridCard, SortableListCard } from './SortableItemCards';
import { GroupHeaderDropRow } from './GroupHeaderDropRow';
import {
  AppWindow,
  Link,
  Plus,
  Trash,
  Package,
  Play,
  FolderOpen,
  PencilSimple,
  ShieldCheck,
  // WarningCircle,
  FolderSimple,
  CaretRight,
} from '@phosphor-icons/react';

import { Item, Group, openItem, openItemAsAdmin, deleteItem, restoreItem, renameItem, showInFolder, launchItems, reorderItems, moveItemToGroup } from '../../api';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useNotification } from '../../context/NotificationContext';
import { summarizeLaunchResult } from '../../utils/launch';
import { hasOpenOverlay } from '../../utils/overlay';

import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { setItemIcon, resetItemIcon } from '../../api'; // gộp vào dòng import api hiện có
// và thêm ImageSquare, ArrowCounterClockwise vào import từ '@phosphor-icons/react'

import {
  // ...các icon đang có (Play, ShieldCheck, FolderOpen, PencilSimple, ...)
  ImageSquare,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';

/** Nhãn dùng chung cho các mục có `ton_tai === false`. */
// const MISSING_HINT = 'Tệp không còn tồn tại trên máy';

interface MenuViewerProps {
  items: Item[];
  groups?: Group[];
  activeGroupId?: string;
  viewMode?: 'grid' | 'list';
  /** Dùng để tự chọn kết quả đầu tiên mỗi khi từ khoá đổi. */
  searchTerm?: string;
  onOpenAddModal: () => void;
}

type RowData = 
  | { type: 'header'; title: string; groupId?: string; itemCount?: number }
  | { type: 'items'; items: Item[]; hasAddNew?: boolean };

export function MenuViewer({ items, groups, activeGroupId, viewMode = 'grid', searchTerm, onOpenAddModal }: MenuViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const [launchingIds, setLaunchingIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * Bản sao đồng bộ của `selectedId`.
   *
   * Bấm mũi tên liên tiếp nhanh hơn nhịp render của React: nếu handler đọc từ
   * state, phím thứ hai vẫn thấy giá trị cũ và lần di chuyển đó bị mất. Ref được
   * cập nhật ngay trong handler nên mọi lần bấm đều được tính.
   */
  const selectedIdRef = useRef<string | null>(null);

  const selectItem = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Item } | null>(null);
  const [renameModalItem, setRenameModalItem] = useState<Item | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [localItems, setLocalItems] = useState<Item[]>(items);
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const didDragRef = useRef(false);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = localItems.find((i) => i.id === activeId) ?? null;
  const handleDragStart = (e: DragStartEvent) => {
    didDragRef.current = false;
    setActiveId(String(e.active.id));
  };
  const { showActionToast, showToast } = useNotification();

  const sortDisabled = !!searchTerm?.trim();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Đóng Context Menu khi click ra ngoài, cuộn hoặc nhấn phím
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    window.addEventListener('scroll', handleCloseMenu, true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('scroll', handleCloseMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Tính toán số cột cho chế độ Grid dựa trên chiều rộng container
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.clientWidth;
        if (width > 1200) setColumns(6);
        else if (width > 900) setColumns(5);
        else if (width > 600) setColumns(4);
        else if (width > 400) setColumns(3);
        else setColumns(2);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const rowsData: RowData[] = useMemo(() => {
    const rows: RowData[] = [];
    const isList = viewMode === 'list';

    if (activeGroupId === 'tatca' && groups && groups.length > 0) {
      // Nhóm mặc định (Khác) hoặc các item chưa được phân nhóm hợp lệ
      const customGroupIds = new Set(groups.filter(g => g.id !== 'grp-default').map(g => g.id));
      const defaultGroupItems = localItems.filter(i => i.nhom_id === 'grp-default' || !customGroupIds.has(i.nhom_id));
      
      if (isList) {
        // Chế độ List: nút Thêm mới ở hàng đầu tiên
        rows.push({ type: 'items', hasAddNew: true, items: [] });
        defaultGroupItems.forEach(item => {
          rows.push({ type: 'items', hasAddNew: false, items: [item] });
        });
      } else {
        // Chế độ Grid
        const defaultRows = Math.ceil((defaultGroupItems.length + 1) / columns);
        for (let r = 0; r < defaultRows; r++) {
          const startIndex = r * columns - 1;
          const rowItems = [];
          for (let i = 0; i < columns; i++) {
            const idx = startIndex + i;
            if (idx >= 0 && idx < defaultGroupItems.length) {
              rowItems.push(defaultGroupItems[idx]);
            }
          }
          rows.push({ type: 'items', hasAddNew: r === 0, items: rowItems });
        }
      }

      // Các nhóm tùy chỉnh
      const customGroups = groups.filter(g => g.id !== 'grp-default');
      for (const group of customGroups) {
        const groupItems = localItems.filter(i => i.nhom_id === group.id);
        
        if (groupItems.length > 0) {
          rows.push({ type: 'header', title: group.ten, groupId: group.id, itemCount: groupItems.length });

          if (isList) {
            groupItems.forEach(item => {
              rows.push({ type: 'items', hasAddNew: false, items: [item] });
            });
          } else {
            const groupRowsCount = Math.ceil(groupItems.length / columns);
            for (let r = 0; r < groupRowsCount; r++) {
              const startIndex = r * columns;
              const rowItems = groupItems.slice(startIndex, startIndex + columns);
              rows.push({ type: 'items', hasAddNew: false, items: rowItems });
            }
          }
        }
      }
    } else {
      // Xem một nhóm cụ thể
      if (isList) {
        rows.push({ type: 'items', hasAddNew: true, items: [] });
        localItems.forEach(item => {
          rows.push({ type: 'items', hasAddNew: false, items: [item] });
        });
      } else {
        const totalRowsCount = Math.ceil((localItems.length + 1) / columns);
        for (let r = 0; r < totalRowsCount; r++) {
          const startIndex = r * columns - 1;
          const rowItems = [];
          for (let i = 0; i < columns; i++) {
            const idx = startIndex + i;
            if (idx >= 0 && idx < localItems.length) {
              rowItems.push(localItems[idx]);
            }
          }
          rows.push({ type: 'items', hasAddNew: r === 0, items: rowItems });
        }
      }
    }
    return rows;
  }, [localItems, groups, activeGroupId, columns, viewMode]);

  /**
   * Danh sách phẳng để điều hướng bằng bàn phím, dẫn xuất từ chính `rowsData`
   * nên thứ tự luôn khớp với thứ tự nhìn thấy (kể cả ô "Thêm mới" chiếm chỗ ở
   * hàng đầu và các tiêu đề nhóm xen giữa).
   */
  const navItems = useMemo(() => {
    const nav: { item: Item; rowIndex: number }[] = [];
    rowsData.forEach((row, rowIndex) => {
      if (row.type === 'items') {
        row.items.forEach((item) => nav.push({ item, rowIndex }));
      }
    });
    return nav;
  }, [rowsData]);

  /**
   * Thứ tự cho dnd-kit phải đúng thứ tự nhìn thấy. Ở trang "Tất cả" các mục được
   * gom theo nhóm nên khác thứ tự trong `localItems`; dùng thứ tự gốc sẽ làm
   * rectSortingStrategy dời icon sang hàng/nhóm khác khi kéo.
   */
  const sortableIds = useMemo(() => navItems.map((n) => n.item.id), [navItems]);

  const rowVirtualizer = useVirtualizer({
    count: rowsData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rowsData[index];
      if (row.type === 'header') return 48;
      if (viewMode === 'list') {
        return row.hasAddNew ? 52 : 64;
      }
      return 148;
    },
    overscan: 5,
  });

  const handleDeleteItem = async (item: Item) => {
    const displayName = item.ten.length > 20 ? `${item.ten.slice(0, 18)}...` : item.ten;

    let removedIndex: number;
    try {
      removedIndex = await deleteItem(item.id);
    } catch (e) {
      console.error(e);
      showToast(`Không xóa được "${displayName}": ${String(e)}`, 'error');
      return;
    }

    window.dispatchEvent(new CustomEvent('app-items-changed'));

    // Toast Hoàn tác trong 5 giây
    showActionToast(
      `Đã xóa "${displayName}"`,
      'Hoàn tác',
      async () => {
        try {
          await restoreItem(item, removedIndex);
          window.dispatchEvent(new CustomEvent('app-items-changed'));
        } catch (err) {
          console.error('Lỗi khi hoàn tác:', err);
          showToast(`Không thể hoàn tác "${displayName}": ${String(err)}`, 'error');
        }
      },
      5000
    );
  };

  const handleMoveToGroup = async (sourceId: string, targetGroupId: string, groupTitle: string) => {
    const sourceItem = localItems.find((i) => i.id === sourceId);
    if (!sourceItem || sourceItem.nhom_id === targetGroupId) return;

    try {
      await moveItemToGroup(sourceId, targetGroupId);
      showToast(`Đã chuyển "${sourceItem.ten}" sang nhóm "${groupTitle}"`, 'success');
      window.dispatchEvent(new CustomEvent('app-items-changed'));
    } catch (err) {
      console.error(err);
      showToast(`Lỗi khi chuyển nhóm: ${String(err)}`, 'error');
    }
  };

  /**
   * Sắp xếp lại thứ tự ứng dụng hoặc chuyển nhóm khi thả lên một ứng dụng khác.
   */
  const handleReorder = async (sourceId: string, targetId: string) => {
    // Tính theo thứ tự nhìn thấy (giống dnd-kit), không theo thứ tự lưu trong `localItems`.
    const from = sortableIds.indexOf(sourceId);
    const to = sortableIds.indexOf(targetId);
    if (from === -1 || to === -1 || from === to) return;

    const byId = new Map(localItems.map((i) => [i.id, i]));
    const sourceItem = byId.get(sourceId);
    const targetItem = byId.get(targetId);
    if (!sourceItem || !targetItem) return;
    const groupChanged = sourceItem.nhom_id !== targetItem.nhom_id;

    // Cập nhật giao diện ngay lập tức (Optimistic UI)
    const newOrder = arrayMove(sortableIds, from, to);
    const inOrder = new Set(newOrder);
    const newItems = [
      ...newOrder.map((id) =>
        id === sourceId ? { ...sourceItem, nhom_id: targetItem.nhom_id } : byId.get(id)!
      ),
      ...localItems.filter((i) => !inOrder.has(i.id)),
    ];
    setLocalItems(newItems);

    if (groupChanged) {
      try {
        await moveItemToGroup(sourceItem.id, targetItem.nhom_id);
      } catch (e) {
        console.error('Lỗi khi chuyển nhóm khi kéo thả:', e);
        showToast(`Lỗi khi chuyển nhóm: ${String(e)}`, 'error');
        window.dispatchEvent(new CustomEvent('app-items-changed'));
        return;
      }
    }

    try {
      await reorderItems(newItems.map((i) => i.id));
      window.dispatchEvent(new CustomEvent('app-items-changed'));
    } catch (e) {
      console.error('Lỗi khi lưu thứ tự ứng dụng:', e);
      showToast('Lỗi khi lưu thứ tự ứng dụng', 'error');
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id;
    setDragOverItemId(overId ? String(overId) : null);
  };

  /**
   * Sidebar nằm ngoài DndContext nên không là droppable của dnd-kit. Thay vào đó
   * các nút nhóm gắn `data-drop-group-id`; ta tìm phần tử dưới con trỏ lúc thả.
   */
  const findGroupDropTarget = (event: { activatorEvent: Event; delta: { x: number; y: number } }) => {
    const ev = event.activatorEvent as Partial<PointerEvent>;
    if (typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') return null;
    const x = ev.clientX + event.delta.x;
    const y = ev.clientY + event.delta.y;
    for (const el of document.elementsFromPoint(x, y)) {
      const target = el.closest<HTMLElement>('[data-drop-group-id]');
      if (target) return target;
    }
    return null;
  };

  const dropHighlightRef = useRef<HTMLElement | null>(null);
  const DROP_HIGHLIGHT = ['ring-2', 'ring-primary', 'bg-primary/10'];
  const setDropHighlight = (el: HTMLElement | null) => {
    if (dropHighlightRef.current === el) return;
    dropHighlightRef.current?.classList.remove(...DROP_HIGHLIGHT);
    el?.classList.add(...DROP_HIGHLIGHT);
    dropHighlightRef.current = el;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setDropHighlight(findGroupDropTarget(event));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    didDragRef.current = true;
    setDragOverItemId(null);
    setDropHighlight(null);
    setTimeout(() => {
      didDragRef.current = false;
    }, 100);

    const { active, over } = event;

    // Thả lên nút nhóm ở sidebar
    const groupEl = findGroupDropTarget(event);
    if (groupEl) {
      const targetGroupId = groupEl.dataset.dropGroupId!;
      const groupTitle = groups?.find((g) => g.id === targetGroupId)?.ten ?? groupEl.title ?? 'nhóm mới';
      await handleMoveToGroup(String(active.id), targetGroupId, groupTitle);
      return;
    }

    if (!over || active.id === over.id || sortDisabled) return;

    const sourceId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith('group-header-')) {
      const targetGroupId = overId.slice('group-header-'.length);
      const groupTitle = groups?.find((g) => g.id === targetGroupId)?.ten ?? 'nhóm mới';
      await handleMoveToGroup(sourceId, targetGroupId, groupTitle);
      return;
    }

    await handleReorder(sourceId, overId);
  };

  const handleLaunchItem = async (item: Item) => {
    if (launchingIds.includes(item.id)) return;
    setLaunchingIds((prev) => [...prev, item.id]);
    try {
      await openItem(item.id);
    } catch (e) {
      console.error(e);
      showToast(String(e), 'error');
      // Backend có thể vừa đánh dấu mục là không còn tồn tại — tải lại để hiển thị đúng.
      window.dispatchEvent(new CustomEvent('app-items-changed'));
    } finally {
      setTimeout(() => {
        setLaunchingIds((prev) => prev.filter((id) => id !== item.id));
      }, 1200);
    }
  };

  // Gõ tìm kiếm xong là chọn sẵn kết quả đầu tiên, để chỉ cần Enter là mở —
  // đây là thao tác chính của một launcher.
  // `items` (đã lọc) đến từ cha sau khi từ khoá đổi, nên khi effect này chạy
  // `navItems` còn là bản cũ: đặt cờ "chờ chọn" để effect theo `navItems` chọn
  // kết quả đầu tiên của danh sách MỚI.
  const pendingSearchSelectRef = useRef(false);
  const pendingSearchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(pendingSearchTimerRef.current);
    if (searchTerm && searchTerm.trim()) {
      pendingSearchSelectRef.current = true;
      // Nếu danh sách không đổi thì cờ không bao giờ được dùng — tự tắt để
      // lần tải lại dữ liệu sau này không cướp mất lựa chọn của người dùng.
      pendingSearchTimerRef.current = window.setTimeout(() => {
        pendingSearchSelectRef.current = false;
      }, 400);
    } else {
      pendingSearchSelectRef.current = false;
      selectItem(null);
    }
    // Chỉ chạy khi từ khoá đổi, không chạy mỗi lần dữ liệu được tải lại.
  }, [searchTerm]);

  useEffect(() => {
    if (!pendingSearchSelectRef.current) return;
    pendingSearchSelectRef.current = false;
    window.clearTimeout(pendingSearchTimerRef.current);
    selectItem(navItems.length > 0 ? navItems[0].item.id : null);
  }, [navItems]);

  // Điều hướng bằng bàn phím. Danh sách được ảo hoá nên không thể dùng Tab —
  // phải tự quản lý mục đang chọn và chủ động cuộn nó vào tầm nhìn.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Lớp phủ đang mở thì phím thuộc về nó.
      if (hasOpenOverlay() || navItems.length === 0) return;

      const target = e.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      const isGrid = viewMode === 'grid';
      const currentIndex = navItems.findIndex((n) => n.item.id === selectedIdRef.current);

      if (e.key === 'Enter') {
        if (currentIndex >= 0) {
          e.preventDefault();
          handleLaunchItem(navItems[currentIndex].item);
        }
        return;
      }

      let delta: number | null = null;
      if (e.key === 'ArrowDown') delta = isGrid ? columns : 1;
      else if (e.key === 'ArrowUp') delta = isGrid ? -columns : -1;
      else if (isGrid && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        // Đang gõ trong ô nhập thì trái/phải là di chuyển con trỏ văn bản.
        if (inTextField) return;
        delta = e.key === 'ArrowRight' ? 1 : -1;
      }
      if (delta === null) return;

      e.preventDefault();
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : navItems.length - 1
          : Math.min(navItems.length - 1, Math.max(0, currentIndex + delta));

      const next = navItems[nextIndex];
      selectItem(next.item.id);
      rowVirtualizer.scrollToIndex(next.rowIndex, { align: 'auto' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navItems, columns, viewMode, launchingIds]);

  const handleContextMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 210);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setContextMenu({ x, y, item });
  };

  const handleSaveRename = async () => {
    if (!renameModalItem) return;
    const cleanName = renameInput.trim();
    if (!cleanName) {
      showToast('Tên ứng dụng không được để trống', 'warning');
      return;
    }
    try {
      await renameItem(renameModalItem.id, cleanName);
      window.dispatchEvent(new CustomEvent('app-items-changed'));
      showToast('Đã đổi tên hiển thị thành công', 'success');
      setRenameModalItem(null);
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi đổi tên ứng dụng', 'error');
    }
  };


    const handleChangeIcon = async (item: Item) => {
      try {
        const selected = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: 'Ảnh / Icon', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'bmp', 'gif', 'exe', 'dll'] }],
        });
        if (typeof selected !== 'string') return; // người dùng hủy
        await setItemIcon(item.id, selected);
        window.dispatchEvent(new CustomEvent('app-items-changed'));
        showToast('Đã đổi icon', 'success');
      } catch (e) {
        console.error(e);
        showToast(`Không đổi được icon: ${String(e)}`, 'error');
      }
    };

    const handleResetIcon = async (item: Item) => {
      try {
        await resetItemIcon(item.id);
        window.dispatchEvent(new CustomEvent('app-items-changed'));
        showToast('Đã khôi phục icon mặc định', 'success');
      } catch (e) {
        console.error(e);
        showToast('Không khôi phục được icon', 'error');
      }
    };


  const handleLaunchGroup = async (groupId: string, groupTitle: string) => {
    // Chỉ chạy các mục đang hiển thị của nhóm — `items` đã được lọc theo tìm kiếm.
    const targetIds = items.filter((i) => i.nhom_id === groupId).map((i) => i.id);
    if (targetIds.length === 0) return;

    showToast(`Đang khởi chạy ${targetIds.length} ứng dụng trong nhóm "${groupTitle}"...`, 'info');
    try {
      const summary = summarizeLaunchResult(await launchItems(targetIds));
      showToast(summary.message, summary.type);
    } catch (e) {
      console.error(e);
      showToast(`Lỗi khi mở nhóm: ${String(e)}`, 'error');
    }
  };

  const getIcon = (item: Item, size: 'sm' | 'md' = 'md') => {
    const isSmall = size === 'sm';
    const dimClass = isSmall ? 'h-7 w-7' : 'h-9 w-9';
    const iconSize = isSmall ? 20 : 26;

    if (item.icon_cache && item.icon_cache.length > 0) {
      return (
        <img 
          src={convertFileSrc(item.icon_cache)} 
          alt="icon" 
          draggable={false}
          className={`${dimClass} object-contain pointer-events-none select-none`} 
        />
      );
    }
    if (item.loai === 'link') return <Link size={iconSize} weight="regular" />;
    if (item.loai === 'folder') return <Package size={iconSize} weight="regular" />;
    return <AppWindow size={iconSize} weight="regular" />;
  };

  return (
    <DndContext
        sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragMove={handleDragMove}
  onDragEnd={handleDragEnd}
  onDragCancel={() => { setActiveId(null); setDragOverItemId(null); setDropHighlight(null); }}

    >
    <div
      ref={parentRef}
      role="listbox"
      aria-label="Danh sách ứng dụng"
      className="custom-scrollbar h-full w-full overflow-y-auto px-6 py-4"
    >
      {localItems.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center animate-fade-up">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <AppWindow size={32} weight="regular" />
          </div>
          <h3 className="font-serif text-2xl font-semibold text-foreground">
            Chưa có ứng dụng nào
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Hãy thêm file, thư mục hoặc đường link để bắt đầu tổ chức không gian làm việc của bạn.
          </p>
          <button
            onClick={onOpenAddModal}
            className="btn-primary mt-6 animate-fade-up anim-delay-2 cursor-pointer"
          >
            <Plus size={16} weight="regular" />
            Thêm mục đầu tiên
          </button>
        </div>
      ) : (
        <SortableContext
          items={sortableIds}
          strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
        >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowData = rowsData[virtualRow.index];

            if (rowData.type === 'header' && rowData.groupId) {
              return (
                <GroupHeaderDropRow
                  key={virtualRow.key}
                  groupId={rowData.groupId}
                  title={rowData.title}
                  itemCount={rowData.itemCount}
                  virtualRow={virtualRow}
                  onLaunchGroup={handleLaunchGroup}
                />
              );
            }
            if (rowData.type === 'header') return null;

            // === CHẾ ĐỘ XEM DANH SÁCH (LIST VIEW) ===
            if (viewMode === 'list') {
              if (rowData.hasAddNew) {
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size - 8}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <button
                      onClick={onOpenAddModal}
                      className="glass-card glass-card-hover flex h-full w-full items-center justify-center gap-2 rounded-xl border-dashed border-primary/30 text-xs font-semibold text-primary/80 transition-all hover:border-primary hover:text-primary"
                    >
                      <Plus size={16} weight="bold" />
                      <span>Thêm mục mới</span>
                    </button>
                  </div>
                );
              }

              const item = rowData.items?.[0];
              if (!item) return null;

              return (
                <SortableListCard
                  key={virtualRow.key}
                  item={item}
                  virtualRow={virtualRow}
                  sortDisabled={sortDisabled}
                  isLaunching={launchingIds.includes(item.id)}
                  isSelected={selectedId === item.id}
                  isDragOver={dragOverItemId === item.id}
                  getIcon={getIcon}
                  didDragRef={didDragRef}
                  onSelect={selectItem}
                  onLaunch={handleLaunchItem}
                  onDelete={handleDeleteItem}
                  onContextMenu={handleContextMenu}
                />
              );
            }

            // === CHẾ ĐỘ XEM LƯỚI (GRID VIEW) ===
            const rowItemsRender = [];

            if (rowData.hasAddNew) {
              rowItemsRender.push(
                <button
                  key="add-new"
                  onClick={onOpenAddModal}
                  className="group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-border px-2 py-3 text-primary/80 transition-colors duration-150 hover:border-primary/70 hover:bg-primary/15 hover:text-primary hover:backdrop-blur-md"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Plus size={26} weight="regular" />
                  </div>
                  <span className="text-[13px] font-medium [text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">Thêm mới</span>
                </button>              );
            }

            rowData.items?.forEach((item) => {
              rowItemsRender.push(
                <SortableGridCard
                  key={item.id}
                  item={item}
                  sortDisabled={sortDisabled}
                  isLaunching={launchingIds.includes(item.id)}
                  isSelected={selectedId === item.id}
                  isDragOver={dragOverItemId === item.id}
                  getIcon={getIcon}
                  didDragRef={didDragRef}
                  onSelect={selectItem}
                  onLaunch={handleLaunchItem}
                  onDelete={handleDeleteItem}
                  onContextMenu={handleContextMenu}
                />
              );
            });

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size - 16}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid gap-4"
                ref={(el) => {
                  if (el) el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
                }}
              >
                {rowItemsRender}
              </div>
            );
          })}
        </div>
        </SortableContext>
      )}

      {/* Context Menu Chuột Phải */}
      {contextMenu &&
        createPortal(
          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            data-overlay="context-menu"
            className="fixed z-[999] min-w-[190px] rounded-xl border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-modal animate-fade-in text-xs font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                handleLaunchItem(contextMenu.item);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
            >
              <Play size={15} weight="fill" className="text-primary" />
              <span>Mở ứng dụng</span>
            </button>

            {/* Chạy dưới quyền Administrator (chỉ hiển thị với file/app cục bộ) */}
            {!contextMenu.item.duong_dan.toLowerCase().startsWith('http://') &&
              !contextMenu.item.duong_dan.toLowerCase().startsWith('https://') && (
                <button
                  onClick={async () => {
                    const item = contextMenu.item;
                    setContextMenu(null);
                    try {
                      await openItemAsAdmin(item.id);
                      showToast(`Đã yêu cầu mở [${item.ten}] dưới quyền Administrator`, 'info');
                    } catch (e) {
                      showToast(String(e), 'warning');
                    }
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
                >
                  <ShieldCheck size={15} weight="duotone" className="text-amber-500" />
                  <span>Chạy quyền Administrator</span>
                </button>
              )}

            <button
              onClick={async () => {
                const path = contextMenu.item.duong_dan;
                setContextMenu(null);
                try {
                  await showInFolder(path);
                } catch (e) {
                  console.error(e);
                  showToast('Không thể mở vị trí tệp', 'error');
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
            >
              <FolderOpen size={15} weight="regular" className="text-muted-foreground" />
              <span>Mở vị trí tệp</span>
            </button>

            <button
              onClick={() => {
                setRenameModalItem(contextMenu.item);
                setRenameInput(contextMenu.item.ten);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
            >
              <PencilSimple size={15} weight="regular" className="text-muted-foreground" />
              <span>Đổi tên hiển thị</span>
            </button>

            <button
              onClick={() => {
                const item = contextMenu.item;
                setContextMenu(null);
                handleChangeIcon(item);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
            >
              <ImageSquare size={15} weight="regular" className="text-muted-foreground" />
              <span>Đổi icon...</span>
            </button>

            {/\/custom-[^\\/]*$/.test(contextMenu.item.icon_cache.replace(/\\/g, '/')) && (
              <button
                onClick={() => {
                  const item = contextMenu.item;
                  setContextMenu(null);
                  handleResetIcon(item);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
              >
                <ArrowCounterClockwise size={15} weight="regular" className="text-muted-foreground" />
                <span>Khôi phục icon mặc định</span>
              </button>
            )}


            {/* Chuyển sang nhóm */}
            {groups && groups.length > 1 && (
              <div className="relative group/submenu">
                <div className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <FolderSimple size={15} weight="regular" className="text-muted-foreground" />
                    <span>Chuyển sang nhóm</span>
                  </div>
                  <CaretRight size={12} weight="bold" className="text-muted-foreground" />
                </div>

                <div
                  className={`hidden group-hover/submenu:block absolute top-0 min-w-[160px] rounded-xl border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-modal animate-fade-in text-xs font-medium max-h-56 overflow-y-auto ${
                    contextMenu.x > window.innerWidth - 380 ? 'right-full mr-1' : 'left-full ml-1'
                  }`}
                >
                  {groups.map((g) => {
                    const isCurrent = g.id === contextMenu.item.nhom_id;
                    return (
                      <button
                        key={g.id}
                        disabled={isCurrent}
                        onClick={async () => {
                          const targetGroup = g;
                          const currentItem = contextMenu.item;
                          setContextMenu(null);
                          try {
                            await moveItemToGroup(currentItem.id, targetGroup.id);
                            showToast(`Đã chuyển "${currentItem.ten}" sang nhóm "${targetGroup.ten}"`, 'success');
                            window.dispatchEvent(new CustomEvent('app-items-changed'));
                          } catch (e) {
                            console.error(e);
                            showToast(`Lỗi khi chuyển nhóm: ${String(e)}`, 'error');
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                          isCurrent
                            ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                            : 'text-foreground hover:bg-muted/80'
                        }`}
                      >
                        <span className="truncate">{g.ten}</span>
                        {isCurrent && <span className="text-[10px] text-muted-foreground font-mono">(Hiện tại)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="my-1 h-[1px] bg-border/60" />

            <button
              onClick={() => {
                handleDeleteItem(contextMenu.item);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash size={15} weight="regular" />
              <span>Xóa khỏi Menu</span>
            </button>
          </div>,
          document.body
        )}

      {/* Modal Đổi tên hiển thị */}
      {renameModalItem &&
        createPortal(
          <div className="modal-backdrop flex items-center justify-center p-4" onClick={() => setRenameModalItem(null)}>
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
                  if (e.key === 'Escape') setRenameModalItem(null);
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRenameModalItem(null)}
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
        )}
    </div>
    {createPortal(
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="flex h-full w-full items-center justify-center rounded-2xl bg-foreground/10 ring-1 ring-primary/60 backdrop-blur-md">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)] [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
              {getIcon(activeItem, 'md')}
            </div>
          </div>
        ) : null}
      </DragOverlay>,
      document.body
    )}
    </DndContext>
  );
}