fn main() {
    // Load .env file if present (dev builds). In CI/production, set SGDB_API_KEY
    // as a real environment variable instead — the .env file is gitignored.
    if let Ok(content) =
        std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env"))
    {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                // Only set if not already set by the real environment
                if std::env::var(key.trim()).is_err() {
                    println!("cargo:rustc-env={}={}", key.trim(), value.trim());
                }
            }
        }
    }

    // Tell Cargo to re-run this script if .env changes
    println!("cargo:rerun-if-changed=.env");

    tauri_build::build()
}
