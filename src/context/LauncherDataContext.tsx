import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { getAllGroups, getAllItems, getWorkspaces, Group, Item, Workspace } from '../api';
import { useNotification } from './NotificationContext';
import { HAY_DUNG_ID, GAN_DAY_ID, isVirtualGroup } from '../utils/virtualGroups';

interface LauncherDataValue {
  groups: Group[];
  items: Item[];
  workspaces: Workspace[];
  activeGroupId: string;
  activeGroup: { id: string; ten: string };
  defaultGroup: Group | undefined;
  customGroups: Group[];
  selectGroup: (id: string) => void;
  refresh: () => Promise<void>;
}

const LauncherDataContext = createContext<LauncherDataValue | undefined>(undefined);

export function LauncherDataProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(
    () => localStorage.getItem('app_active_group_id') || 'tatca'
  );

  const { showToast } = useNotification();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  /** Số thứ tự lần refresh mới nhất — chỉ kết quả của lần này được áp dụng. */
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    try {
      const [gData, iData, wData] = await Promise.all([getAllGroups(), getAllItems(), getWorkspaces()]);
      if (seq !== refreshSeqRef.current) return; // đã có lần refresh mới hơn
      setGroups(gData);
      setItems(iData);
      setWorkspaces(wData);

      // Nhóm đang chọn bị xóa thì quay về "Tất cả"
      setActiveGroupId((current) => {
        if (current !== 'tatca' && !isVirtualGroup(current) && !gData.some((g) => g.id === current)) {
          localStorage.setItem('app_active_group_id', 'tatca');
          return 'tatca';
        }
        return current;
      });
    } catch (e) {
      console.error('Lỗi khi tải dữ liệu:', e);
      if (seq === refreshSeqRef.current) {
        showToastRef.current(`Lỗi khi tải dữ liệu: ${String(e)}`, 'error');
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('app-items-changed', refresh);
    return () => window.removeEventListener('app-items-changed', refresh);
  }, [refresh]);

  const selectGroup = useCallback((id: string) => {
    setActiveGroupId(id);
    localStorage.setItem('app_active_group_id', id);
  }, []);

  const defaultGroup = useMemo(() => groups.find((g) => g.id === 'grp-default'), [groups]);
  const customGroups = useMemo(() => groups.filter((g) => g.id !== 'grp-default'), [groups]);

  const activeGroup = useMemo(() => {
    if (activeGroupId === 'tatca') return { id: 'tatca', ten: 'Tất cả' };
    if (activeGroupId === HAY_DUNG_ID) return { id: HAY_DUNG_ID, ten: 'Hay dùng' };
    if (activeGroupId === GAN_DAY_ID) return { id: GAN_DAY_ID, ten: 'Gần đây' };
    if (activeGroupId === 'grp-default') return defaultGroup || { id: 'grp-default', ten: 'Khác' };
    return groups.find((g) => g.id === activeGroupId) || { id: 'tatca', ten: 'Tất cả' };
  }, [activeGroupId, defaultGroup, groups]);

  return (
    <LauncherDataContext.Provider
      value={{ groups, items, workspaces, activeGroupId, activeGroup, defaultGroup, customGroups, selectGroup, refresh }}
    >
      {children}
    </LauncherDataContext.Provider>
  );
}

export function useLauncherData() {
  const ctx = useContext(LauncherDataContext);
  if (!ctx) throw new Error('useLauncherData must be used within LauncherDataProvider');
  return ctx;
}