import { Suspense, useState, type ReactNode } from 'react';

interface LazyMountProps {
  /** Cờ mở của modal; chỉ khi lần đầu = true mới mount con (để chunk lazy được tải). */
  open: boolean;
  children: ReactNode;
}

/**
 * Chỉ mount (và tải chunk React.lazy) khi modal được mở lần đầu; sau đó giữ nguyên
 * để hành vi giống trước (modal tự trả về null khi đóng, state không bị mất giữa chừng).
 */
export function LazyMount({ open, children }: LazyMountProps) {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);
  if (!everOpened) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}
