import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash, ArrowCounterClockwise, Eye } from '@phosphor-icons/react';
import { useNotification } from '../../context/NotificationContext';
import {
  useBackground,
  updateBackground,
  resetBackgroundSettings,
  setBackgroundImage,
  clearBackgroundImage,
  BgFit,
} from '../../utils/background';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, unit = '%', onChange }: SliderProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: 'rgb(var(--color-primary))' }}
      />
    </div>
  );
}

const FIT_OPTIONS: { id: BgFit; label: string }[] = [
  { id: 'cover', label: 'Phủ kín' },
  { id: 'contain', label: 'Vừa khung' },
  { id: 'repeat', label: 'Lặp lại' },
];

interface BackgroundSettingsProps {
  /** Báo cho hộp Cài đặt ẩn/hiện để xem toàn bộ nền phía sau */
  onPeek: (on: boolean) => void;
}

export function BackgroundSettings({ onPeek }: BackgroundSettingsProps) {
  const { settings: s, imageUrl } = useBackground();
  const { showToast } = useNotification();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng một tệp
    if (!file) return;
    setIsBusy(true);
    try {
      await setBackgroundImage(file);
      showToast('Đã đổi hình nền', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // Giữ chuột để ẩn hộp Cài đặt; thả chuột ở bất kỳ đâu thì hiện lại
  const startPeek = () => {
    onPeek(true);
    const stop = () => {
      onPeek(false);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
  };

  const handleClear = async () => {
    try {
      await clearBackgroundImage();
      showToast('Đã xoá hình nền', 'info');
    } catch (err) {
      showToast(String(err), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Hình nền
        </h3>

        <div className="glass-card rounded-xl p-4">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/60 text-muted-foreground">
              {imageUrl ? (
                <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={26} weight="regular" />
              )}
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={isBusy}
                className="btn-primary text-xs"
              >
                {imageUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
              </button>
              {imageUrl && (
                <>
                  <button onClick={handleClear} className="btn-ghost border border-border text-xs">
                    <Trash size={14} weight="regular" />
                    Xoá ảnh
                  </button>
                  <button
                    onPointerDown={startPeek}
                    className="btn-ghost border border-border text-xs select-none"
                    title="Giữ chuột để ẩn hộp cài đặt và xem toàn bộ nền"
                  >
                    <Eye size={14} weight="regular" />
                    Giữ để xem nền
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {imageUrl && (
        <>
          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              Điều chỉnh ảnh
            </h3>
            <div className="glass-card space-y-4 rounded-xl p-4">
              <Slider label="Độ sáng" value={s.brightness} min={0} max={200} onChange={(v) => updateBackground({ brightness: v })} />
              <Slider label="Độ tương phản" value={s.contrast} min={50} max={150} onChange={(v) => updateBackground({ contrast: v })} />
              <Slider label="Độ bão hoà màu" value={s.saturate} min={0} max={200} onChange={(v) => updateBackground({ saturate: v })} />
              <Slider label="Độ mờ (blur)" value={s.blur} min={0} max={40} unit="px" onChange={(v) => updateBackground({ blur: v })} />
              <Slider label="Độ mờ đục của ảnh" value={s.opacity} min={10} max={100} onChange={(v) => updateBackground({ opacity: v })} />
              <Slider label="Lớp phủ tối" value={s.overlay} min={0} max={90} onChange={(v) => updateBackground({ overlay: v })} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              Giao diện đè lên ảnh
            </h3>
            <div className="glass-card space-y-4 rounded-xl p-4">
              <Slider label="Độ đặc của thẻ và khung" value={s.cardOpacity} min={20} max={100} onChange={(v) => updateBackground({ cardOpacity: v })} />
              <Slider label="Làm mờ phía sau thẻ" value={s.cardBlur} min={0} max={30} unit="px" onChange={(v) => updateBackground({ cardBlur: v })} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              Cách hiển thị
            </h3>
            <div className="glass-card space-y-4 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-2">
                {FIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => updateBackground({ fit: opt.id })}
                    className={`rounded-xl border p-2 text-xs font-semibold transition-colors ${
                      s.fit === opt.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Slider label="Vị trí ngang" value={s.posX} min={0} max={100} onChange={(v) => updateBackground({ posX: v })} />
              <Slider label="Vị trí dọc" value={s.posY} min={0} max={100} onChange={(v) => updateBackground({ posY: v })} />
            </div>
          </div>

          <button onClick={resetBackgroundSettings} className="btn-ghost border border-border text-xs">
            <ArrowCounterClockwise size={14} weight="regular" />
            Đặt lại thông số mặc định
          </button>
        </>
      )}
    </div>
  );
}
