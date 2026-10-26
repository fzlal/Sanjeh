use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const STORE_DIR: &str = "store";
const META_FILE: &str = "meta.json";
const SETTINGS_FILE: &str = "settings.json";
const MAX_PDF_BYTES: usize = 20 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSnapshot {
    ready: bool,
    exams: Vec<Value>,
    sessions: Vec<Value>,
    settings: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPayload {
    id: String,
    #[serde(default)]
    digest: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamPayload {
    exam: Value,
    #[serde(default)]
    pdfs: Vec<PdfPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePayload {
    exams: Vec<ExamPayload>,
    sessions: Vec<Value>,
    settings: Value,
}

fn store_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(STORE_DIR))
        .map_err(|error| format!("storage: could not resolve the app data directory: {error}"))
}

fn ensure_layout(root: &Path) -> Result<(), String> {
    for name in ["exams", "sessions", "pdfs"] {
        fs::create_dir_all(root.join(name))
            .map_err(|error| format!("storage: could not create {name}: {error}"))?;
    }
    Ok(())
}

fn safe_id(id: &str) -> Result<&str, String> {
    let safe = !id.is_empty()
        && id.len() <= 200
        && id != "."
        && id != ".."
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'));
    if safe {
        Ok(id)
    } else {
        Err(format!("storage: unsafe record id {id:?}"))
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "storage: invalid target path".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("storage: could not create {}: {error}", parent.display()))?;
    let temporary = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("record"),
        std::process::id()
    ));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("storage: could not write {}: {error}", temporary.display()))?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("storage: could not replace {}: {error}", path.display()))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("storage: could not finalize {}: {error}", path.display()))
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value)
        .map_err(|error| format!("storage: could not encode JSON: {error}"))?;
    write_atomic(path, &bytes)
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("storage: could not read {}: {error}", path.display()))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("storage: invalid JSON in {}: {error}", path.display()))
}

fn read_jsons(directory: &Path) -> Result<Vec<Value>, String> {
    let mut entries: Vec<PathBuf> = fs::read_dir(directory)
        .map_err(|error| format!("storage: could not list {}: {error}", directory.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
        .collect();
    entries.sort();
    entries.iter().map(|path| read_json(path)).collect()
}

fn record_id(value: &Value, kind: &str) -> Result<String, String> {
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("storage: {kind} is missing an id"))?;
    safe_id(id)?;
    Ok(id.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex
}

fn write_pdf(root: &Path, payload: &PdfPayload) -> Result<(), String> {
    let id = safe_id(&payload.id)?;
    let bytes = STANDARD
        .decode(payload.data.as_bytes())
        .map_err(|_| "storage: a PDF payload is not valid base64".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_PDF_BYTES {
        return Err("storage: a PDF payload has an invalid size".to_string());
    }
    let digest = sha256_hex(&bytes);
    if !payload.digest.is_empty() && payload.digest != digest {
        return Err(format!("pdfImmutable: PDF {id} does not match its digest"));
    }
    let path = root.join("pdfs").join(format!("{id}.pdf"));
    if path.exists() {
        let stored = fs::read(&path)
            .map_err(|error| format!("storage: could not read PDF {id}: {error}"))?;
        if sha256_hex(&stored) != digest {
            return Err(format!("pdfImmutable: stored PDF {id} cannot be replaced"));
        }
        return Ok(());
    }
    write_atomic(&path, &bytes)
}

fn collect_pdf_refs(exam: &Value) -> Result<Vec<(String, u64, String)>, String> {
    let mut refs = Vec::new();
    let mut push_list = |value: Option<&Value>, label: &str| -> Result<(), String> {
        let entries = match value {
            Some(entries) => entries
                .as_array()
                .ok_or_else(|| format!("storage: {label} is not an array"))?,
            None => return Ok(()),
        };
        for entry in entries {
            let id = entry
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("storage: a PDF in {label} is missing an id"))?;
            let size = entry.get("size").and_then(Value::as_u64).unwrap_or(0);
            let digest = entry
                .get("digest")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            refs.push((id.to_string(), size, digest));
        }
        Ok(())
    };
    push_list(exam.get("answerPdfs"), "answerPdfs")?;
    let booklets = exam
        .get("booklets")
        .and_then(Value::as_array)
        .ok_or_else(|| "storage: an exam is missing its booklets".to_string())?;
    for booklet in booklets {
        push_list(booklet.get("pdfs"), "booklet pdfs")?;
    }
    Ok(refs)
}

/// Every referenced PDF must exist on disk; digests are verified when known so
/// an edited exam can never silently change the bytes behind a stable id.
fn verify_pdf_refs(root: &Path, exam: &Value) -> Result<(), String> {
    for (id, size, digest) in collect_pdf_refs(exam)? {
        safe_id(&id)?;
        let path = root.join("pdfs").join(format!("{id}.pdf"));
        let bytes = fs::read(&path)
            .map_err(|_| format!("storage: the bytes for PDF {id} are missing"))?;
        if size > 0 && bytes.len() as u64 != size {
            return Err(format!("pdfImmutable: PDF {id} has an unexpected size"));
        }
        if !digest.is_empty() && sha256_hex(&bytes) != digest {
            return Err(format!("pdfImmutable: PDF {id} has an unexpected digest"));
        }
    }
    Ok(())
}

fn cleanup_orphan_pdfs(root: &Path) -> Result<(), String> {
    let exams = read_jsons(&root.join("exams"))?;
    let mut referenced = std::collections::HashSet::new();
    for exam in &exams {
        for (id, _, _) in collect_pdf_refs(exam)? {
            referenced.insert(id);
        }
    }
    let directory = root.join("pdfs");
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("storage: could not list {}: {error}", directory.display()))?
    {
        let path = entry
            .map_err(|error| format!("storage: could not inspect a PDF: {error}"))?
            .path();
        if path.extension().and_then(|value| value.to_str()) != Some("pdf") {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if !referenced.contains(id) {
            fs::remove_file(&path).map_err(|error| {
                format!("storage: could not remove {}: {error}", path.display())
            })?;
        }
    }
    Ok(())
}

fn write_exam(root: &Path, payload: &ExamPayload) -> Result<(), String> {
    let id = record_id(&payload.exam, "exam")?;
    for pdf in &payload.pdfs {
        write_pdf(root, pdf)?;
    }
    verify_pdf_refs(root, &payload.exam)?;
    write_json(&root.join("exams").join(format!("{id}.json")), &payload.exam)
}

fn write_layout(root: &Path, payload: &ReplacePayload) -> Result<(), String> {
    ensure_layout(root)?;
    let mut exam_ids = std::collections::HashSet::new();
    for exam in &payload.exams {
        let id = record_id(&exam.exam, "exam")?;
        if !exam_ids.insert(id) {
            return Err("storage: duplicate exam id in replacement payload".to_string());
        }
        write_exam(root, exam)?;
    }
    let mut session_ids = std::collections::HashSet::new();
    for session in &payload.sessions {
        let id = record_id(session, "session")?;
        if !session_ids.insert(id.clone()) {
            return Err("storage: duplicate session id in replacement payload".to_string());
        }
        write_json(
            &root.join("sessions").join(format!("{id}.json")),
            session,
        )?;
    }
    write_json(&root.join(SETTINGS_FILE), &payload.settings)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

fn replace_store(app: &AppHandle, payload: &ReplacePayload) -> Result<(), String> {
    let root = store_root(app)?;
    let parent = root
        .parent()
        .ok_or_else(|| "storage: invalid app data directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("storage: could not create the app data directory: {error}"))?;
    let staging = parent.join(format!(".store-staging-{}", std::process::id()));
    let previous = parent.join(".store-previous");
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("storage: could not clear staging: {error}"))?;
    }
    if previous.exists() {
        fs::remove_dir_all(&previous)
            .map_err(|error| format!("storage: could not clear the previous store: {error}"))?;
    }
    write_layout(&staging, payload)?;
    if root.exists() {
        fs::rename(&root, &previous)
            .map_err(|error| format!("storage: could not stage the current store: {error}"))?;
    }
    if let Err(error) = fs::rename(&staging, &root) {
        if previous.exists() {
            let _ = fs::rename(&previous, &root);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("storage: could not install the new store: {error}"));
    }
    if previous.exists() {
        fs::remove_dir_all(&previous)
            .map_err(|error| format!("storage: could not remove the previous store: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn store_ready(app: AppHandle) -> Result<bool, String> {
    let root = store_root(&app)?;
    Ok(root.join(META_FILE).exists())
}

#[tauri::command]
pub fn store_mark_ready(app: AppHandle) -> Result<(), String> {
    let root = store_root(&app)?;
    ensure_layout(&root)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

#[tauri::command]
pub fn store_load(app: AppHandle) -> Result<StoreSnapshot, String> {
    let root = store_root(&app)?;
    if !root.exists() {
        return Ok(StoreSnapshot {
            ready: false,
            exams: Vec::new(),
            sessions: Vec::new(),
            settings: None,
        });
    }
    ensure_layout(&root)?;
    let settings = if root.join(SETTINGS_FILE).exists() {
        Some(read_json(&root.join(SETTINGS_FILE))?)
    } else {
        None
    };
    Ok(StoreSnapshot {
        ready: root.join(META_FILE).exists(),
        exams: read_jsons(&root.join("exams"))?,
        sessions: read_jsons(&root.join("sessions"))?,
        settings,
    })
}

#[tauri::command]
pub fn store_save_exam(app: AppHandle, payload: ExamPayload) -> Result<(), String> {
    let root = store_root(&app)?;
    ensure_layout(&root)?;
    write_exam(&root, &payload)?;
    cleanup_orphan_pdfs(&root)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

#[tauri::command]
pub fn store_save_session(app: AppHandle, session: Value) -> Result<(), String> {
    let root = store_root(&app)?;
    ensure_layout(&root)?;
    let id = record_id(&session, "session")?;
    write_json(&root.join("sessions").join(format!("{id}.json")), &session)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

#[tauri::command]
pub fn store_save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let root = store_root(&app)?;
    ensure_layout(&root)?;
    write_json(&root.join(SETTINGS_FILE), &settings)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

#[tauri::command]
pub fn store_delete_exam(app: AppHandle, exam_id: String) -> Result<(), String> {
    let root = store_root(&app)?;
    let id = safe_id(&exam_id)?;
    let path = root.join("exams").join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("storage: could not remove the exam: {error}"))?;
    }
    ensure_layout(&root)?;
    cleanup_orphan_pdfs(&root)
}

#[tauri::command]
pub fn store_delete_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let root = store_root(&app)?;
    let id = safe_id(&session_id)?;
    let path = root.join("sessions").join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("storage: could not remove the session: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn store_replace_all(app: AppHandle, payload: ReplacePayload) -> Result<(), String> {
    replace_store(&app, &payload)
}

#[tauri::command]
pub fn store_clear(app: AppHandle) -> Result<(), String> {
    let root = store_root(&app)?;
    if root.exists() {
        fs::remove_dir_all(&root)
            .map_err(|error| format!("storage: could not clear the store: {error}"))?;
    }
    ensure_layout(&root)?;
    write_json(&root.join(META_FILE), &serde_json::json!({ "version": 1 }))
}

#[tauri::command]
pub fn store_load_pdf(app: AppHandle, pdf_id: String) -> Result<String, String> {
    let root = store_root(&app)?;
    let id = safe_id(&pdf_id)?;
    let path = root.join("pdfs").join(format!("{id}.pdf"));
    let bytes = fs::read(&path)
        .map_err(|_| format!("storage: the bytes for PDF {id} are missing"))?;
    if bytes.len() > MAX_PDF_BYTES {
        return Err("storage: the stored PDF is too large".to_string());
    }
    Ok(STANDARD.encode(bytes))
}

fn download_name(value: &str) -> String {
    let base = value
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(value)
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let trimmed = base.trim().trim_matches('.');
    let name = if trimmed.is_empty() { "sanjeh-download" } else { trimmed };
    name.chars().take(180).collect()
}

fn unique_download_path(directory: &Path, name: &str) -> PathBuf {
    let candidate = directory.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("sanjeh-download");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 1..10_000 {
        let file_name = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = directory.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{stem}-{}", std::process::id()))
}

/// Writes downloaded PDFs and exported backups outside the app store, on the
/// user's Downloads folder when the platform provides one.
#[tauri::command]
pub fn save_bytes_to_downloads(
    app: AppHandle,
    file_name: String,
    data_base64: String,
) -> Result<String, String> {
    let bytes = STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|_| "storage: the download payload is not valid base64".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err("storage: the download payload has an invalid size".to_string());
    }
    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().app_data_dir().map(|dir| dir.join("downloads")))
        .map_err(|error| format!("storage: could not resolve a download folder: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("storage: could not create the download folder: {error}"))?;
    let path = unique_download_path(&directory, &download_name(&file_name));
    write_atomic(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}
