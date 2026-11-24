import { useEffect, useState, useRef, lazy } from 'react';
import { realGroupOrDefault } from '../utils/virtualGroups';
import { DownloadSimple } from '@phosphor-icons/react';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';
import { setAlwaysOnTop, registerGlobalShortcut } from '../api';
import { useNotification } from '../context/NotificationContext';
import { addItemsToGroup, summarizeAddOutcome } from '../utils/addItems';
import {
  isValidShortcut,
  readSavedShortcutKeys,
  isShortcutEnabled,
  persistShortcut,
  DEFAULT_SHORTCUT_KEYS,
} from '../utils/shortcut';
import { checkForUpdate, installUpdate } from '../utils/updater';
import { FOCUS_SEARCH_EVENT, hasOpenOverlay } from '../utils/overlay';

import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { BackgroundLayer } from '../components/BackgroundLayer';
import { LauncherDataProvider } from '../context/LauncherDataContext';
import { LazyMount } from '../components/LazyMount';

const ShortcutSetupModal = lazy(() => import('../features/Settings/ShortcutSetupModal').then((m) => ({ default: m.ShortcutSetupModal })));

export function MainWindow() {
  const [isDragging, setIsDragging] = useState(false);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(
    () => localStorage.getItem('app_has_configured_shortcut') === null
  );
  const { showToast, showActionToast, confirm } = useNotification();

  // Kiểm tra cập nhật im lặng sau 10 giây: mọi lỗi (mất mạng, chưa có release,
  // pubkey chưa cấu hình) chỉ ghi log, không làm phiền người dùng.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update = await checkForUpdate();
        if (!update) return;
        showActionToast(`Có phiên bản mới ${update.version}`, 'Cập nhật', async () => {
          try {
            showToast('Đang tải bản cập nhật...', 'info');
            await installUpdate(update);
          } catch (e) {
            console.error('Lỗi cài đặt cập nhật:', e);
            showToast(`Không cập nhật được: ${e}`, 'error');
          }
        }, 30000);
      } catch (e) {
        console.warn('Bỏ qua kiểm tra cập nhật:', e);
      }
    }, 10000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khôi phục trạng thái Ghim trên cùng (Always on Top) & Phím tắt toàn cầu khi khởi động
  useEffect(() => {
    if (localStorage.getItem('app_always_on_top') === 'true') {
      setAlwaysOnTop(true).catch((e) => console.error('Lỗi khôi phục AlwaysOnTop:', e));
    }

    // Chỉ khôi phục phím tắt nếu cờ enabled = 'true'
    const savedKeys = readSavedShortcutKeys();
    if (!isShortcutEnabled() || !savedKeys) return;

    // Cấu hình cũ có thể chứa phím đơn không còn được phép (sẽ chiếm phím đó trên
    // toàn hệ thống). Chuyển sang tổ hợp mặc định để tính năng vẫn dùng được, thay
    // vì để người dùng với một phím tắt chết mà không biết.
    const isLegacyInvalid = !isValidShortcut(savedKeys);
    const keysToUse = isLegacyInvalid ? [...DEFAULT_SHORTCUT_KEYS] : savedKeys;
    if (isLegacyInvalid) {
      persistShortcut(keysToUse);
    }

    registerGlobalShortcut(keysToUse.join('+'))
      .then(() => {
        if (isLegacyInvalid) {
          showToast(
            `Phím tắt cũ (${savedKeys.join(' + ')}) không còn được hỗ trợ vì sẽ chiếm phím này trên toàn hệ thống. Đã chuyển sang ${keysToUse.join(' + ')} — bạn có thể đổi lại trong Cài đặt.`,
            'warning'
          );
        }
      })
      .catch((e) => {
        console.error('Lỗi khôi phục Global Shortcut:', e);
        // Không đăng ký được (thường do xung đột với ứng dụng khác) — tắt cờ để
        // trạng thái lưu trữ khớp với thực tế, và nói rõ cho người dùng.
        localStorage.setItem('app_shortcut_enabled', 'false');
        showToast(
          `Không đăng ký được phím tắt ${keysToUse.join(' + ')} (có thể đang bị ứng dụng khác chiếm). Đã tạm tắt phím tắt toàn cục — hãy chọn tổ hợp khác trong Cài đặt.`,
          'warning'
        );
      });
  }, []);

  // Lắng nghe sự kiện đồng bộ từ Backend chạy ngầm
  useEffect(() => {
    if (window.__TAURI_INTERNALS__ === undefined) return;
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen('app-items-changed', () => {
      window.dispatchEvent(new CustomEvent('app-items-changed'));
    }).then((u) => {
      if (isMounted) {
        unlisten = u;
      } else {
        u();
      }
    });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Lắng nghe event app-window-shown để tự focus DOM khi mở bằng phím tắt
  useEffect(() => {
    if (window.__TAURI_INTERNALS__ === undefined) return;
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen('app-window-shown', () => {
      window.focus();
      // `documentElement.focus()` không có tác dụng vì <html> không focus được.
      // Đưa con trỏ về ô tìm kiếm để gõ được ngay sau khi bấm phím tắt.
      window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
    }).then((u) => {
      if (isMounted) {
        unlisten = u;
      } else {
        u();
      }
    });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Chặn Windows System Menu mặc định khi bấm Alt + Space trong cửa sổ
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, []);

  const isInternalDragRef = useRef(false);

  // Theo dõi khi có kéo thả phần tử DOM nội bộ (sắp xếp icon / chuyển nhóm)
  useEffect(() => {
    const handleDragStart = () => {
      isInternalDragRef.current = true;
    };
    const handleDragEnd = () => {
      isInternalDragRef.current = false;
      setIsDragging(false);
    };
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);
    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
    };
  }, []);

  useEffect(() => {
    if (window.__TAURI_INTERNALS__ === undefined) return;

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      const appWindow = getCurrentWebviewWindow();

      const u = await appWindow.onDragDropEvent(async (event) => {
        // Nếu đang kéo thả nội bộ trong app, tuyệt đối không kích hoạt overlay thêm file ngoài
        if (isInternalDragRef.current || (window as unknown as { __IS_INTERNAL_DRAGGING__?: boolean }).__IS_INTERNAL_DRAGGING__) {
          setIsDragging(false);
          return;
        }

        const type = event?.payload?.type;

        // Đang mở modal/menu thì không nhận file thả từ ngoài.
        if (hasOpenOverlay()) {
          setIsDragging(false);
          return;
        }

        if (type === 'over' || type === 'enter') {
          setIsDragging(true);
        } else if (type === 'drop') {
          setIsDragging(false);

          const paths = event?.payload?.paths ?? [];
          if (paths.length === 0) return;

          const savedGroupId = localStorage.getItem('app_active_group_id');
          const targetGroupId = realGroupOrDefault(savedGroupId);

          const outcome = await addItemsToGroup(paths, targetGroupId, confirm);

          window.dispatchEvent(new CustomEvent('app-items-changed'));

          const summary = summarizeAddOutcome(outcome);
          if (summary) showToast(summary.message, summary.type);
        } else {
          setIsDragging(false);
        }
      });

      if (isMounted) {
        unlisten = u;
      } else {
        u();
      }
    };

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="app-bg relative flex h-screen w-screen overflow-hidden text-foreground">
      <BackgroundLayer />

      {/* Main layout */}
      <div className="relative z-10 flex flex-col sm:flex-row h-full w-full gap-3 sm:gap-4 p-2 sm:p-4 animate-fade-in">
        <LauncherDataProvider>
          <Sidebar />
          <ContentArea />
        </LauncherDataProvider>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm">
          <div className="bg-card shadow-modal w-full max-w-lg rounded-3xl border-2 border-dashed border-primary/40 p-12 text-center animate-modal-in">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <DownloadSimple size={30} weight="regular" />
            </div>

            <h2 className="font-serif text-2xl font-semibold tracking-tight">
              Thả file vào đây để thêm
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              File sẽ được thêm tự động vào nhóm đang chọn.
            </p>
          </div>
        </div>
      )}

      {/* Shortcut Setup Modal on First Launch */}
      <LazyMount open={isShortcutModalOpen}>
        <ShortcutSetupModal
          isOpen={isShortcutModalOpen}
          onClose={() => setIsShortcutModalOpen(false)}
        />
      </LazyMount>
    </div>
  );
}