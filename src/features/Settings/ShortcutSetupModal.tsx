import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, Check, ArrowRight, X, Sparkle, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { registerGlobalShortcut } from '../../api';
import { useNotification } from '../../context/NotificationContext';
import {
  resolveMainKey,
  isValidShortcut,
  persistShortcut,
  DEFAULT_SHORTCUT_KEYS,
  SHORTCUT_HINT,
} from '../../utils/shortcut';

interface ShortcutSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutSetupModal({ isOpen, onClose }: ShortcutSetupModalProps) {
  const [keys, setKeys] = useState<string[]>(() => [...DEFAULT_SHORTCUT_KEYS]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const latestKeysRef = useRef<string[]>([...DEFAULT_SHORTCUT_KEYS]);
  const { showToast } = useNotification();

  useEffect(() => {
    if (!isOpen || !isRecording) return;

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
        latestKeysRef.current = pressedKeys;
        setKeys(pressedKeys);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Kết thúc ghi nhận khi người dùng thả phím
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isOpen, isRecording]);

  const handleSave = async () => {
    setIsRecording(false);

    if (!isValidShortcut(keys)) {
      showToast(`Tổ hợp phím chưa hợp lệ! ${SHORTCUT_HINT}`, 'warning');
      return;
    }

    setIsSaving(true);
    const shortcutStr = keys.join('+');
    try {
      await registerGlobalShortcut(shortcutStr);
      persistShortcut(keys);
      localStorage.setItem('app_shortcut_enabled', 'true');
      localStorage.setItem('app_has_configured_shortcut', 'true');
      showToast(`Đã kích hoạt phím tắt toàn cầu: ${keys.join(' + ')}`, 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast(`Không thể đăng ký phím tắt ${shortcutStr}: ${String(e)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setIsRecording(false);
    localStorage.setItem('app_has_configured_shortcut', 'skipped');
    localStorage.setItem('app_shortcut_enabled', 'false');
    onClose();
  };

  const applyPreset = (presetKeys: string[]) => {
    const copy = [...presetKeys];
    latestKeysRef.current = copy;
    setKeys(copy);
    setIsRecording(false);
  };

  if (!isOpen) return null;

  const isValid = isValidShortcut(keys);

  return createPortal(
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={handleSkip}>
      <div
        className="modal-panel w-full max-w-md overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkle size={22} weight="duotone" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold tracking-tight text-foreground">
                Chào mừng bạn!
              </h2>
              <p className="text-xs text-muted-foreground">
                Thiết lập phím tắt mở nhanh Launcher từ bất kỳ đâu
              </p>
            </div>
          </div>
          <button onClick={handleSkip} className="icon-btn" title="Bỏ qua">
            <X size={18} weight="regular" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Interactive Key Recorder Box */}
          <div className="text-center space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Bấm vào khung bên dưới và nhấn tổ hợp phím trên bàn phím của bạn:
            </p>

            <div
              onClick={() => setIsRecording(true)}
              className={`group relative flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-4 transition-all duration-300 ${
                isRecording
                  ? 'border-primary bg-primary/5 ring-4 ring-primary/10 animate-pulse'
                  : 'border-border/80 bg-card/60 hover:border-primary/50 hover:bg-card'
              }`}
            >
              {isRecording ? (
                <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                  <Keyboard size={20} className="animate-bounce" />
                  <span>Đang ghi nhận... Hãy bấm tổ hợp phím trên bàn phím</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {keys.map((k, idx) => (
                    <span key={idx} className="flex items-center gap-2">
                      <kbd className="inline-flex min-w-[42px] items-center justify-center rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm font-bold text-foreground shadow-sm">
                        {k}
                      </kbd>
                      {idx < keys.length - 1 && (
                        <span className="text-muted-foreground/60 font-bold text-sm">+</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Validation status badge */}
            <div className="flex items-center justify-center gap-1.5 text-xs">
              {isValid ? (
                <span className="flex items-center gap-1 text-emerald-500 font-medium">
                  <CheckCircle size={14} weight="fill" />
                  Tổ hợp phím hợp lệ
                </span>
              ) : (
                <span className="flex items-center gap-1 text-center text-amber-500 font-medium">
                  <WarningCircle size={14} weight="fill" className="flex-shrink-0" />
                  {SHORTCUT_HINT}
                </span>
              )}
            </div>
          </div>

          {/* Preset Suggestions */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Gợi ý phím tắt thông dụng:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Ctrl + Shift + M (Khuyên dùng)', keys: DEFAULT_SHORTCUT_KEYS },
                { label: 'Alt + M', keys: ['Alt', 'M'] },
                { label: 'Ctrl + Alt + M', keys: ['Ctrl', 'Alt', 'M'] },
                { label: 'F12', keys: ['F12'] },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPreset(preset.keys)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                    keys.join('+') === preset.keys.join('+')
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={handleSkip}
              className="btn-ghost text-xs px-4 py-2 text-muted-foreground hover:text-foreground"
            >
              Bỏ qua
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary text-xs flex items-center gap-2 px-5 py-2.5 font-semibold"
            >
              <Check size={16} weight="bold" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu & Bắt đầu'}</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
