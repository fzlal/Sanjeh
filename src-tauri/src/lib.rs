mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            store::store_ready,
            store::store_mark_ready,
            store::store_load,
            store::store_save_exam,
            store::store_save_session,
            store::store_save_settings,
            store::store_delete_exam,
            store::store_delete_session,
            store::store_replace_all,
            store::store_clear,
            store::store_load_pdf,
            store::save_bytes_to_downloads,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SANJEH");
}
