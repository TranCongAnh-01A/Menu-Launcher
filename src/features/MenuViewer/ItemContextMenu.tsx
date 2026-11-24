import { createPortal } from 'react-dom';
import {
  Trash,
  Play,
  FolderOpen,
  PencilSimple,
  ShieldCheck,
  FolderSimple,
  CaretRight,
  ImageSquare,
  ArrowCounterClockwise,
  ClockCounterClockwise,
} from '@phosphor-icons/react';
import { Item, Group, openItemAsAdmin, showInFolder, moveItemToGroup } from '../../api';

export interface ItemContextMenuState {
  x: number;
  y: number;
  item: Item;
}

interface ItemContextMenuProps {
  contextMenu: ItemContextMenuState;
  groups?: Group[];
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onClose: () => void;
  onLaunch: (item: Item) => void;
  onDelete: (item: Item) => void;
  onRename: (item: Item) => void;
  onChangeIcon: (item: Item) => void;
  onResetIcon: (item: Item) => void;
  onResetUsage: (item: Item) => void;
}

/** Menu chuột phải của một mục (portal ra body). */
export function ItemContextMenu({
  contextMenu,
  groups,
  showToast,
  onClose,
  onLaunch,
  onDelete,
  onRename,
  onChangeIcon,
  onResetIcon,
  onResetUsage,
}: ItemContextMenuProps) {
  return createPortal(

          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            data-overlay="context-menu"
            className="fixed z-[999] min-w-[190px] rounded-xl border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-modal animate-fade-in text-xs font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onLaunch(contextMenu.item);
                onClose();
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
                    onClose();
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
                onClose();
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
                onRename(contextMenu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
            >
              <PencilSimple size={15} weight="regular" className="text-muted-foreground" />
              <span>Đổi tên hiển thị</span>
            </button>

            <button
              onClick={() => {
                const item = contextMenu.item;
                onClose();
                onChangeIcon(item);
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
                  onClose();
                  onResetIcon(item);
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
                          onClose();
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

            {(contextMenu.item.so_lan_mo > 0 || contextMenu.item.lan_mo_cuoi != null) && (
              <button
                onClick={() => {
                  const item = contextMenu.item;
                  onClose();
                  onResetUsage(item);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-foreground hover:bg-muted/80 transition-colors"
              >
                <ClockCounterClockwise size={15} weight="regular" className="text-muted-foreground" />
                <span>Xoá khỏi lịch sử</span>
              </button>
            )}

            <div className="my-1 h-[1px] bg-border/60" />

            <button
              onClick={() => {
                onDelete(contextMenu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash size={15} weight="regular" />
              <span>Xóa khỏi Menu</span>
            </button>
          </div>,
    document.body
  );
}
