import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Power, Gear, Info, Palette, PushPin, ArrowsClockwise, FolderOpen, Sun, Moon, Desktop, Keyboard, CheckCircle, CaretDown } from '@phosphor-icons/react';
import { setAlwaysOnTop, rescanValidity, openDataFolder, registerGlobalShortcut, unregisterGlobalShortcut } from '../../api';
import { useNotification } from '../../context/NotificationContext';
import { useTheme, Theme } from '../../context/ThemeContext';
import {
  resolveMainKey,
  isValidShortcut,
  readSavedShortcutKeys,
  readShortcutKeysOrDefault,
  persistShortcut,
  SHORTCUT_HINT,
} from '../../utils/shortcut';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { Image as ImageIcon } from '@phosphor-icons/react';
import { BackgroundSettings } from './BackgroundSettings';
import { DarkColorSettings } from '../Settings/DarkColorSettings';
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const checkAutostartStatus = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || window.__TAURI_INTERNALS__ === undefined) {
    return false;
  }
  try {
    return await isEnabled();
  } catch (e) {
    console.error('Lỗi kiểm tra autostart:', e);
    return false;
  }
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [autostart, setAutostart] = useState(false);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(() => localStorage.getItem('app_always_on_top') === 'true');
  const [isRescanning, setIsRescanning] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const { showToast } = useNotification();
  const { theme, setTheme } = useTheme();

  // Phím tắt toàn cầu — dùng 2 cờ riêng biệt
  const [shortcutEnabled, setShortcutEnabled] = useState(() => localStorage.getItem('app_shortcut_enabled') === 'true');
  const [shortcutKeys, setShortcutKeys] = useState<string[]>(readShortcutKeysOrDefault);
  const [isRecording, setIsRecording] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const previousKeysRef = useRef<string[]>(shortcutKeys);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const applyPreset = async (keys: string[]) => {
    const newShortcut = keys.join('+');
    try {
      await registerGlobalShortcut(newShortcut);
      persistShortcut(keys);
      setShortcutKeys(keys);
      previousKeysRef.current = keys;
      showToast(`Đã đổi phím tắt thành: ${keys.join(' + ')}`, 'success');
    } catch (err) {
      showToast(`Lỗi khi đăng ký phím tắt: ${String(err)}`, 'error');
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkAutostartStatus().then(setAutostart);
      setAlwaysOnTopState(localStorage.getItem('app_always_on_top') === 'true');

      const enabledStored = localStorage.getItem('app_shortcut_enabled');
      const hasKeys = readSavedShortcutKeys() !== null;
      const isShortcutActive =
        enabledStored === 'true' ||
        (enabledStored === null && hasKeys && localStorage.getItem('app_has_configured_shortcut') !== 'skipped');
      setShortcutEnabled(isShortcutActive);

      // Cấu hình cũ có thể chứa tổ hợp không còn hợp lệ — hiển thị tổ hợp mặc định
      // thay vì một phím tắt không bao giờ đăng ký được.
      const keys = readShortcutKeysOrDefault();
      setShortcutKeys(keys);
      previousKeysRef.current = keys;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isRecording) return;

    // Lưu lại tổ hợp phím trước khi bắt đầu ghi
    previousKeysRef.current = shortcutKeys;

    // Tạm thời hủy đăng ký phím tắt toàn cầu để OS không nuốt phím khi người dùng ấn thử
    unregisterGlobalShortcut().catch((e) => console.error('Lỗi unregister khi recording:', e));

    // Thoát chế độ ghi nhận khi click ra ngoài
    const handleClickOutsideRecording = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRecording(false);
        setShortcutKeys(previousKeysRef.current);
        if (shortcutEnabled && previousKeysRef.current.length > 0) {
          registerGlobalShortcut(previousKeysRef.current.join('+')).catch(console.error);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutsideRecording);

    let currentPressed: string[] = [];

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const pressedKeys: string[] = [];
      if (e.ctrlKey) pressedKeys.push('Ctrl');
      if (e.altKey) pressedKeys.push('Alt');
      if (e.shiftKey) pressedKeys.push('Shift');
      if (e.metaKey) pressedKeys.push('Super');

      const mainKey = resolveMainKey(e);
      if (mainKey && !pressedKeys.includes(mainKey)) {
        pressedKeys.push(mainKey);
      }

      if (pressedKeys.length > 0) {
        currentPressed = pressedKeys;
        setShortcutKeys(pressedKeys);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsRecording(false);

      if (currentPressed.length > 0) {
        if (isValidShortcut(currentPressed)) {
          const newShortcut = currentPressed.join('+');
          registerGlobalShortcut(newShortcut)
            .then(() => {
              persistShortcut(currentPressed);
              previousKeysRef.current = currentPressed;
              showToast(`Đã đổi phím tắt thành: ${currentPressed.join(' + ')}`, 'success');
            })
            .catch((err) => {
              showToast(`Lỗi khi đăng ký phím tắt: ${String(err)}`, 'error');
              setShortcutKeys(previousKeysRef.current);
              if (shortcutEnabled && previousKeysRef.current.length > 0) {
                registerGlobalShortcut(previousKeysRef.current.join('+')).catch(console.error);
              }
            });
        } else {
          showToast(`Tổ hợp phím chưa hợp lệ! ${SHORTCUT_HINT}`, 'warning');
          setShortcutKeys(previousKeysRef.current);
          if (shortcutEnabled && previousKeysRef.current.length > 0) {
            registerGlobalShortcut(previousKeysRef.current.join('+')).catch(console.error);
          }
        }
      } else {
        setShortcutKeys(previousKeysRef.current);
        if (shortcutEnabled && previousKeysRef.current.length > 0) {
          registerGlobalShortcut(previousKeysRef.current.join('+')).catch(console.error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideRecording);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isRecording, shortcutEnabled]);

  const handleToggleShortcut = async () => {
    const nextState = !shortcutEnabled;
    setShortcutEnabled(nextState);
    if (nextState) {
      try {
        await registerGlobalShortcut(shortcutKeys.join('+'));
        persistShortcut(shortcutKeys);
        localStorage.setItem('app_shortcut_enabled', 'true');
        showToast(`Đã bật phím tắt toàn cầu (${shortcutKeys.join(' + ')})`, 'success');
      } catch (e) {
        // Đăng ký thất bại — trả công tắc về trạng thái cũ để giao diện không
        // hiển thị "đang bật" trong khi thực tế không có phím tắt nào chạy.
        setShortcutEnabled(false);
        showToast(String(e), 'error');
      }
    } else {
      try {
        await unregisterGlobalShortcut();
        localStorage.setItem('app_shortcut_enabled', 'false');
        showToast('Đã tắt phím tắt toàn cầu', 'info');
      } catch (e) {
        setShortcutEnabled(true);
        showToast(String(e), 'error');
      }
    }
  };

  const handleToggleAutostart = async () => {
    const newState = !autostart;
    try {
      if (newState) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(newState);
      showToast(newState ? 'Đã bật tự khởi động cùng Windows' : 'Đã tắt tự khởi động cùng Windows', 'success');
    } catch (e) {
      console.error('Lỗi toggle autostart:', e);
      showToast(`Không thể thiết lập khởi động: ${e}`, 'error');
    }
  };

  const handleToggleAlwaysOnTop = async () => {
    const newState = !alwaysOnTop;
    setAlwaysOnTopState(newState);
    localStorage.setItem('app_always_on_top', String(newState));
    try {
      await setAlwaysOnTop(newState);
      showToast(newState ? 'Đã ghim cửa sổ trên cùng' : 'Đã bỏ ghim cửa sổ', 'success');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      const invalidCount = await rescanValidity();
      window.dispatchEvent(new CustomEvent('app-items-changed'));
      showToast(
        invalidCount > 0
          ? `Đã quét xong: ${invalidCount} mục không còn tồn tại trên máy (được đánh dấu cảnh báo trong Menu).`
          : 'Đã quét xong: tất cả mục đều còn hợp lệ.',
        invalidCount > 0 ? 'warning' : 'success'
      );
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi quét lại file', 'error');
    } finally {
      setIsRescanning(false);
    }
  };
  const [isPeeking, setIsPeeking] = useState(false);
  const suppressCloseRef = useRef(false);

  const handlePeek = (on: boolean) => {
    setIsPeeking(on);
    if (on) {
      suppressCloseRef.current = true;
    } else {
      // Cú click do thả chuột sinh ra ngay sau pointerup, nên chờ một chút rồi mới cho phép đóng lại
      setTimeout(() => {
        suppressCloseRef.current = false;
      }, 150);
    }
  };

  const [offset, setOffset] = useState({ x: 0, y: 0 });
const panelRef = useRef<HTMLDivElement>(null);

// Mở lại Cài đặt thì về giữa màn hình
useEffect(() => {
  if (isOpen) setOffset({ x: 0, y: 0 });
}, [isOpen]);

const startDrag = (e: React.PointerEvent) => {
  if ((e.target as HTMLElement).closest('button')) return; // bấm nút thì không kéo
  const panel = panelRef.current;
  if (!panel) return;
  e.preventDefault(); // không bôi đen chữ khi kéo

  const rect = panel.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const baseX = offset.x;
  const baseY = offset.y;
  suppressCloseRef.current = true; // thả chuột ngoài hộp không được đóng Cài đặt

  const onMove = (ev: PointerEvent) => {
    // Giữ lại tối thiểu 100px của hộp trong cửa sổ để không kéo mất hẳn
    const dx = Math.min(
      Math.max(ev.clientX - startX, -rect.left - rect.width + 100),
      window.innerWidth - rect.left - 100
    );
    const dy = Math.min(
      Math.max(ev.clientY - startY, -rect.top),
      window.innerHeight - rect.top - 60
    );
    setOffset({ x: baseX + dx, y: baseY + dy });
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    setTimeout(() => {
      suppressCloseRef.current = false;
    }, 150);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};
  if (!isOpen) return null;

  const tabs = [
  { id: 'general', label: 'Cài đặt chung', icon: Gear },
  { id: 'background', label: 'Hình nền', icon: ImageIcon },
  { id: 'about', label: 'Thông tin', icon: Info },
  ];
  const isBgTab = activeTab === 'background';
  return createPortal(
    <div
      className={`modal-backdrop flex items-center p-4 justify-center`}
      style={
        isBgTab
          ? { backgroundColor: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' }
          : undefined
      }
      onClick={() => {
        if (!suppressCloseRef.current) onClose();
      }}
    >
        <div
          ref={panelRef}
          className="modal-panel flex h-[580px] w-full max-w-3xl overflow-hidden animate-modal-in"
          style={{
            translate: `${offset.x}px ${offset.y}px`,
            visibility: isPeeking ? 'hidden' : 'visible',
            ...(isBgTab ? { backgroundColor: 'rgb(var(--color-card) / 0.85)' } : {}),
          }}
          onClick={(e) => e.stopPropagation()}
        >    
    {/* Sidebar Tabs */}
        <div 
          onPointerDown={startDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          title="Kéo để di chuyển, nhấp đúp để về giữa"
          className="flex w-48 cursor-grab select-none flex-col border-r border-border bg-muted/40 p-3 active:cursor-grabbing">

          <h2 className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Cài đặt
          </h2>
          <nav className="mt-2 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'
                    }`}
                >
                  <Icon size={18} weight="regular" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto">
            <button onClick={onClose} className="icon-btn w-full justify-center">
              <X size={18} weight="regular" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in">
              {/* Theme Settings */}
              <div>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Giao diện & Chủ đề
                </h3>
                
                <div className="glass-card rounded-xl p-4">
                  <div className="mt-3">
                    <DarkColorSettings />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Palette size={20} weight="regular" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Chế độ hiển thị</p>
                      <p className="text-xs text-muted-foreground">
                        Tùy chỉnh tông màu Sáng (Warm Paper), Tối (Warm Obsidian) hoặc theo Windows.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { id: 'light' as Theme, label: 'Sáng', icon: Sun },
                      { id: 'dark' as Theme, label: 'Tối', icon: Moon },
                      { id: 'system' as Theme, label: 'Hệ thống', icon: Desktop },
                    ].map((mode) => {
                      const Icon = mode.icon;
                      const isSelected = theme === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => setTheme(mode.id)}
                          className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all duration-200 ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                          }`}
                        >
                          <Icon size={16} weight={isSelected ? 'fill' : 'regular'} />
                          <span>{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Hệ thống & Cửa sổ
                </h3>
                
                <div className="space-y-3">
                  {/* Khởi động cùng Windows */}
                  <div className="glass-card flex items-center justify-between rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Power size={20} weight="regular" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Khởi động cùng hệ thống</p>
                        <p className="text-xs text-muted-foreground">
                          Tự động mở ứng dụng khi bật máy tính.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleToggleAutostart}
                      className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors duration-300 ${
                        autostart ? 'bg-primary border-primary' : 'bg-muted border-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-smooth ${
                          autostart ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Always on Top */}
                  <div className="glass-card flex items-center justify-between rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <PushPin size={20} weight="regular" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Luôn nổi trên cùng (Always on Top)</p>
                        <p className="text-xs text-muted-foreground">
                          Ghim cửa sổ Launcher luôn hiển thị trên các ứng dụng khác.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleToggleAlwaysOnTop}
                      className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors duration-300 ${
                        alwaysOnTop ? 'bg-primary border-primary' : 'bg-muted border-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-smooth ${
                          alwaysOnTop ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Phím tắt mở nhanh toàn cầu */}
                  <div className="glass-card relative z-20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Keyboard size={20} weight="regular" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">Phím tắt mở nhanh toàn cầu</p>
                          <p className="text-xs text-muted-foreground">
                            Bấm tổ hợp phím từ bất kỳ đâu trên Windows để mở/ẩn Launcher.
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleToggleShortcut}
                        className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors duration-300 ${
                          shortcutEnabled ? 'bg-primary border-primary' : 'bg-muted border-border'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-smooth ${
                            shortcutEnabled ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {shortcutEnabled && (
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Tổ hợp phím (bấm để đổi):</span>
                        <div className="relative" ref={dropdownRef}>
                          <div
                            onClick={() => {
                              if (!isRecording) setIsDropdownOpen(!isDropdownOpen);
                            }}
                            className={`cursor-pointer rounded-xl border px-3 py-1.5 transition-all flex items-center gap-2 ${
                              isRecording
                                ? 'border-primary bg-primary/10 ring-2 ring-primary/20 animate-pulse'
                                : 'border-border bg-card/60 hover:border-primary/40'
                            }`}
                            title="Bấm để đổi tổ hợp phím"
                          >
                            {isRecording ? (
                              <span className="text-xs text-primary font-semibold flex items-center gap-1.5">
                                <Keyboard size={14} className="animate-bounce" />
                                Đang ghi nhận... Bấm phím
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                {shortcutKeys.map((k, idx, arr) => (
                                  <span key={idx} className="flex items-center gap-1">
                                    <kbd className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                                      {k}
                                    </kbd>
                                    {idx < arr.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
                                  </span>
                                ))}
                                <CaretDown size={12} weight="bold" className={`text-muted-foreground ml-1 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                              </div>
                            )}
                          </div>

                          {/* Dropdown Menu */}
                          {isDropdownOpen && !isRecording && (
                            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden animate-fade-in origin-top-right">
                              <div className="flex flex-col py-1.5">
                                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                  Gợi ý nhanh
                                </div>
                                {[
                                  { label: 'Ctrl + Shift + M', keys: ['Ctrl', 'Shift', 'M'] },
                                  { label: 'Alt + M', keys: ['Alt', 'M'] },
                                  { label: 'F12', keys: ['F12'] },
                                ].map((preset, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      setIsDropdownOpen(false);
                                      applyPreset(preset.keys);
                                    }}
                                    className="px-4 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between"
                                  >
                                    <span>{preset.label}</span>
                                    {preset.keys.join('+') === shortcutKeys.join('+') && <CheckCircle size={14} className="text-primary" weight="fill" />}
                                  </button>
                                ))}
                                <div className="h-px bg-border/50 my-1.5"></div>
                                <button
                                  onClick={() => {
                                    setIsDropdownOpen(false);
                                    setIsRecording(true);
                                  }}
                                  className="px-4 py-2.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors font-medium flex items-center gap-2 text-foreground"
                                >
                                  <Keyboard size={16} />
                                  Tùy chỉnh (Tự nhập phím)...
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Dữ liệu & Liên kết
                </h3>
                
                <div className="space-y-3">
                  <div className="glass-card flex items-center justify-between rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ArrowsClockwise size={20} weight="regular" className={isRescanning ? 'animate-spin' : ''} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Quét lại tính hợp lệ của file</p>
                        <p className="text-xs text-muted-foreground">
                          Kiểm tra lại xem các phần mềm, đường dẫn có còn tồn tại trên máy không.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleRescan}
                      disabled={isRescanning}
                      className="btn-ghost text-xs px-4 py-2 border border-border hover:border-primary"
                    >
                      {isRescanning ? 'Đang quét...' : 'Quét ngay'}
                    </button>
                  </div>

                  <div className="glass-card flex items-center justify-between rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <FolderOpen size={20} weight="regular" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Thư mục dữ liệu & Sao lưu</p>
                        <p className="text-xs text-muted-foreground">
                          Mở thư mục chứa cấu hình, ảnh icon, log và các bản sao lưu.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          await openDataFolder();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="btn-ghost text-xs px-4 py-2 border border-border hover:border-primary"
                    >
                      Mở thư mục
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'background' && <BackgroundSettings onPeek={handlePeek} />}
          {activeTab === 'about' && (
            <div className="flex flex-col items-center justify-center text-center animate-fade-in py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Palette size={32} weight="regular" />
              </div>
              <h3 className="font-serif text-xl font-bold tracking-tight">Workspace Launcher</h3>
              <p className="mt-1 text-sm text-muted-foreground">Version 1.0.0 (Warm Editorial)</p>
              <p className="mt-4 max-w-xs text-xs text-muted-foreground/60">
                Được thiết kế lại theo phong cách tối giản cổ điển (Warm Editorial). Tối ưu hóa hiệu suất và trải nghiệm người dùng thư thái.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}