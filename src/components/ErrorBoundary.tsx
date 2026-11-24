import React from 'react';
import { ArrowClockwise, FolderOpen, WarningOctagon } from '@phosphor-icons/react';
import { logFrontendError, openDataFolder } from '../api';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Bắt lỗi render để ứng dụng không rơi vào cửa sổ trắng.
 *
 * Trường hợp này đặc biệt tệ với một ứng dụng khay hệ thống: đóng cửa sổ chỉ ẩn
 * đi chứ không thoát, nên người dùng còn không có cách khởi động lại rõ ràng.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Lỗi giao diện không bắt được:', error, info);

    // Ghi xuống file log — bản release không có devtools để xem lỗi.
    logFrontendError(
      [error.message, error.stack ?? '', info.componentStack ?? ''].join('\n')
    ).catch(() => {
      /* Không còn gì để làm nếu chính việc ghi log cũng lỗi. */
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-bg flex h-screen w-screen items-center justify-center p-6 text-foreground">
        <div className="glass-panel w-full max-w-lg rounded-2xl p-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <WarningOctagon size={28} weight="regular" />
          </div>

          <h1 className="font-serif text-2xl font-bold tracking-tight">
            Ứng dụng gặp sự cố
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Giao diện đã dừng do một lỗi không mong muốn. Dữ liệu menu của bạn vẫn an toàn —
            tải lại là đủ để tiếp tục. Chi tiết lỗi đã được ghi vào thư mục log.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button onClick={() => window.location.reload()} className="btn-primary">
              <ArrowClockwise size={16} weight="regular" />
              Tải lại ứng dụng
            </button>
            <button
              onClick={() => {
                openDataFolder().catch((e) => console.error(e));
              }}
              className="btn-ghost border border-border"
            >
              <FolderOpen size={16} weight="regular" />
              Mở thư mục log
            </button>
          </div>

          <details className="mt-6">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-foreground">
              Chi tiết kỹ thuật
            </summary>
            <pre className="custom-scrollbar mt-3 max-h-48 overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
