use std::path::{Path, PathBuf};
use std::fs::OpenOptions;
use std::io::Write;

pub struct AppLogger {
    log_dir: PathBuf,
}

impl AppLogger {
    pub fn new(app_data_dir: &Path) -> Self {
        let log_dir = app_data_dir.join("logs");
        if !log_dir.exists() {
            let _ = std::fs::create_dir_all(&log_dir);
        }
        
        let logger = Self { log_dir };
        logger.clean_old_logs();
        logger
    }

    pub fn log(&self, level: &str, message: &str) {
        let today = chrono::Local::now().format("%Y%m%d").to_string();
        let log_file = self.log_dir.join(format!("app_{}.log", today));
        
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!("[{}] [{}] {}\n", timestamp, level, message);
        
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
            let _ = file.write_all(line.as_bytes());
        }
    }

    pub fn info(&self, message: &str) {
        self.log("INFO", message);
    }

    pub fn warn(&self, message: &str) {
        self.log("WARN", message);
    }

    pub fn error(&self, message: &str) {
        self.log("ERROR", message);
    }

    fn clean_old_logs(&self) {
        if let Ok(entries) = std::fs::read_dir(&self.log_dir) {
            let mut log_files = Vec::new();
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "log") {
                            log_files.push(path);
                        }
                    }
                }
            }
            log_files.sort();
            
            // Giữ lại tối đa 7 ngày log
            if log_files.len() > 7 {
                let to_delete = log_files.len() - 7;
                for file in log_files.iter().take(to_delete) {
                    let _ = std::fs::remove_file(file);
                }
            }
        }
    }
}
