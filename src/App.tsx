import { MainWindow } from "./layouts/MainWindow";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./App.css";

function App() {
  return (
    // Đặt ngoài cùng để bắt được cả lỗi phát sinh từ chính các provider.
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider>
          <MainWindow />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

