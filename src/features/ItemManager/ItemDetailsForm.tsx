import { useEffect, useState } from 'react';
import { FileArrowUp, FolderOpen } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { BrowserInfo, detectBrowsers } from '../../api';

export type CustomLoai = 'lenh' | 'script' | 'link';

export interface ItemFormValue {
  ten: string;
  loai: CustomLoai;
  duong_dan: string;
  tham_so: string;
  thu_muc_lam_viec: string;
  trinh_duyet: string;
  an_console: boolean;
}

export const EMPTY_FORM: ItemFormValue = {
  ten: '',
  loai: 'lenh',
  duong_dan: '',
  tham_so: '',
  thu_muc_lam_viec: '',
  trinh_duyet: '',
  an_console: false,
};

const LOAI_LABEL: Record<CustomLoai, string> = {
  lenh: 'Lệnh',
  script: 'Script',
  link: 'Link web',
};

interface ItemDetailsFormProps {
  value: ItemFormValue;
  onChange: (v: ItemFormValue) => void;
  /** Cho phép đổi loại (ẩn khi sửa mục thường như exe / folder). */
  showLoaiTabs?: boolean;
  /** Với mục thường: chỉ hiện tên + đường dẫn. */
  simple?: boolean;
}

const labelCls = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

/** Form chung cho thêm (tab Nâng cao) và sửa mục. */
export function ItemDetailsForm({ value, onChange, showLoaiTabs = true, simple = false }: ItemDetailsFormProps) {
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const set = (patch: Partial<ItemFormValue>) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (value.loai === 'link' && browsers.length === 0) {
      detectBrowsers().then(setBrowsers).catch((e) => console.error(e));
    }
  }, [value.loai]);

  const pickFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters:
          value.loai === 'script'
            ? [{ name: 'Script', extensions: ['bat', 'cmd', 'ps1'] }, { name: 'Tất cả', extensions: ['*'] }]
            : [{ name: 'Chương trình', extensions: ['exe', 'bat', 'cmd', 'com'] }, { name: 'Tất cả', extensions: ['*'] }],
      });
      if (typeof selected === 'string') set({ duong_dan: selected });
    } catch (e) {
      console.error(e);
    }
  };

  const pickDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') set({ thu_muc_lam_viec: selected });
    } catch (e) {
      console.error(e);
    }
  };

  const isFile = value.loai === 'lenh' || value.loai === 'script';

  return (
    <div className="space-y-4">
      {showLoaiTabs && !simple && (
        <div className="flex gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
          {(Object.keys(LOAI_LABEL) as CustomLoai[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => set({ loai: l })}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                value.loai === l ? 'bg-primary text-on-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {LOAI_LABEL[l]}
            </button>
          ))}
        </div>
      )}

      <div>
        <label className={labelCls}>Tên hiển thị {showLoaiTabs ? '(để trống = tự đặt)' : ''}</label>
        <input
          type="text"
          value={value.ten}
          onChange={(e) => set({ ten: e.target.value })}
          placeholder="Ví dụ: Chạy server dev"
          className="input-base w-full"
        />
      </div>

      <div>
        <label className={labelCls}>{value.loai === 'link' && !simple ? 'Địa chỉ web (URL)' : 'Đường dẫn'}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value.duong_dan}
            onChange={(e) => set({ duong_dan: e.target.value })}
            placeholder={value.loai === 'link' && !simple ? 'https://...' : 'C:\\...'}
            className="input-base flex-1"
          />
          {(simple || isFile) && (
            <button type="button" onClick={pickFile} className="btn-ghost border border-border/80" title="Chọn tệp">
              <FileArrowUp size={18} weight="regular" />
            </button>
          )}
        </div>
      </div>

      {!simple && isFile && (
        <>
          <div>
            <label className={labelCls}>Tham số dòng lệnh</label>
            <input
              type="text"
              value={value.tham_so}
              onChange={(e) => set({ tham_so: e.target.value })}
              placeholder="--port 3000"
              className="input-base w-full font-mono text-xs"
            />
          </div>
          <div>
            <label className={labelCls}>Thư mục làm việc (để trống = thư mục chứa tệp)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={value.thu_muc_lam_viec}
                onChange={(e) => set({ thu_muc_lam_viec: e.target.value })}
                className="input-base flex-1"
              />
              <button type="button" onClick={pickDir} className="btn-ghost border border-border/80" title="Chọn thư mục">
                <FolderOpen size={18} weight="regular" />
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={value.an_console}
              onChange={(e) => set({ an_console: e.target.checked })}
              className="accent-primary"
            />
            Ẩn cửa sổ console khi chạy
          </label>
        </>
      )}

      {!simple && value.loai === 'link' && (
        <div>
          <label className={labelCls}>Mở bằng trình duyệt</label>
          <select
            value={value.trinh_duyet}
            onChange={(e) => set({ trinh_duyet: e.target.value })}
            className="input-base w-full appearance-none"
          >
            <option value="" className="bg-card text-foreground">
              Trình duyệt mặc định
            </option>
            {browsers.map((b) => (
              <option key={b.duong_dan} value={b.duong_dan} className="bg-card text-foreground">
                {b.ten}
              </option>
            ))}
            {value.trinh_duyet && !browsers.some((b) => b.duong_dan === value.trinh_duyet) && (
              <option value={value.trinh_duyet} className="bg-card text-foreground">
                {value.trinh_duyet}
              </option>
            )}
          </select>
        </div>
      )}
    </div>
  );
}
