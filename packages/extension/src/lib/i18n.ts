/**
 * Tiny i18n: vi + en. Persisted in localStorage so every surface (sidepanel,
 * options) picks up the choice instantly without an RPC round-trip.
 *
 * Mirrors the shape of `./theme` — same pub/sub primitives so React components
 * can re-render on language change, and same install-before-React-renders
 * pattern for SSR-style flicker-free first paint.
 */

import type { AiMode } from "@memex/shared";
import { useEffect, useState } from "react";

export type Lang = "vi" | "en";

const STORAGE_KEY = "memex.lang";

export function getLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "vi" || raw === "en") return raw;
  } catch {}
  // Default to Vietnamese on first run regardless of browser locale —
  // primary audience is Vietnamese; the picker in Options is right there
  // for non-vi users.
  return "vi";
}

export function setLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  apply(lang);
}

function apply(lang: Lang): void {
  try { document.documentElement.setAttribute("lang", lang); } catch {}
  listeners.forEach((fn) => fn(lang));
}

export function installLang(): void {
  apply(getLang());
}

type Listener = (l: Lang) => void;
const listeners = new Set<Listener>();
export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: returns [lang, setLang]; re-renders when lang changes. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLocal] = useState<Lang>(getLang());
  useEffect(() => onLangChange((l) => setLocal(l)), []);
  return [lang, setLang];
}

// ---------- Strings ----------

interface Strings {
  // app shell / topbar
  searchNotes: string;
  allNotes: string;
  unsorted: string;
  filterByFolder: string;
  filterByTag: string;
  allTags: string;
  noTags: string;
  newBtn: string;
  newFolder: string;
  folderName: string;
  deleteFolder: string;
  deleteFolderConfirm: (name: string, count: number) => string;
  deleteFolderAndNotes: string;
  deleteFolderKeepNotes: string;
  manageFolders: string;
  foldersPageTitle: string;
  foldersEmpty: string;
  foldersEmptyHint: string;
  foldersCreatePlaceholder: string;
  foldersNoteCount: (n: number) => string;
  renameFolder: string;
  save: string;
  more: string;
  saveSelectedText: string;
  saveWholePage: string;
  settings: string;
  // app states
  loading: string;
  noMatches: string;
  noMatchesHint: string;
  emptyTitle: string;
  emptyHint: string;
  newNote: string;
  noFilterMatches: string;
  noFilterMatchesHint: string;
  clearFilters: string;
  // sort
  sort: string;
  sortUpdated: string;
  sortCreated: string;
  sortAz: string;
  sortZa: string;
  // auto organize (AI folder suggestions)
  autoOrganize: string;
  autoOrganizeTitle: string;
  autoOrganizeRunning: string;
  autoOrganizePlanHeader: string;
  autoOrganizeAccept: string;
  autoOrganizeCancel: string;
  autoOrganizeNoNotes: string;
  autoOrganizeParseErr: string;
  autoOrganizeApplying: string;
  autoOrganizeDone: (folders: number, notes: number) => string;
  autoOrganizeDoneAssign: (notes: number) => string;
  autoOrganizeFolderCount: (count: number) => string;
  autoOrganizeNoFolders: string;
  autoOrganizeNoUnsorted: string;
  autoOrganizeNoFit: string;
  // capture errors
  errPageUnreadable: string;
  errNoSelection: string;
  errPageEmpty: string;
  // meet recorder
  recordMeeting: string;
  meetRecordingTitle: string;
  meetScanning: string;
  meetNoTab: string;
  meetNoTabHint: string;
  meetStart: string;
  meetStartFor: (title: string) => string;
  meetStopSave: string;
  meetDiscard: string;
  meetCaptionsOn: string;
  meetCaptionsOff: string;
  meetCaptionsOffHint: string;
  meetSaved: string;
  meetDuration: (mmss: string) => string;
  meetEmptyTranscript: string;
  meetBack: string;
  meetFallbackTitle: string;
  meetInjectFailed: (reason: string) => string;
  meetScriptMissing: string;
  meetNoteHeading: string;
  meetTranscriptHeading: string;
  meetNoteEmpty: string;
  meetReloadHint: string;
  // banner
  hostNotRegistered: string;
  hostNotRegisteredAfter: string;
  dismiss: string;
  // editor
  back: string;
  moveToFolder: string;
  deleteNote: string;
  saving: string;
  edited: string;
  saved: string;
  untitled: string;
  confirmDelete: (title: string) => string;
  // tags
  addTags: string;
  removeTag: string;
  // rich editor
  startWriting: string;
  rtH1: string;
  rtH2: string;
  rtBold: string;
  rtItalic: string;
  rtStrike: string;
  rtCode: string;
  rtBullet: string;
  rtNumbered: string;
  rtTodo: string;
  rtQuote: string;
  rtCodeBlock: string;
  // ai action bar
  cancel: string;
  streaming: string;
  appendToNote: string;
  replaceNote: string;
  replaceSelection: string;
  insertAfter: string;
  appendToEnd: string;
  copy: string;
  discard: string;
  autoTitleTags: string;
  autoTitleTagsTitle: string;
  autoMetaParseErr: (msg: string) => string;
  selectionLabel: (chars: number) => string;
  wholeNoteLabel: string;
  // ai mode labels
  modeLabel: Record<AiMode, string>;
  modeHint: Record<AiMode, string>;
  // options page
  optTitle: string;
  optNativeHost: string;
  optRecheck: string;
  optPinging: string;
  optHostUnreachable: string;
  optHostVersion: string;
  optNode: string;
  optClaudeCli: string;
  optNotOnPath: string;
  optSqliteDb: string;
  optExtensionId: string;
  optAiProvider: string;
  optTestConn: string;
  optTesting: string;
  optTestConnTip: string;
  optTestNeedsHostTip: string;
  optSave: string;
  optSavedFlash: string;
  optProvider: string;
  optClaudeCliOpt: string;
  optOpenaiOpt: string;
  optOllamaOpt: string;
  optOpenaiKey: string;
  optModel: string;
  optOllamaUrl: string;
  optClaudeHint: string;
  optAppearance: string;
  optThemeDark: string;
  optThemeLight: string;
  optThemeSystem: string;
  optThemeHint: string;
  optLanguage: string;
  optLangVi: string;
  optLangEn: string;
  optAbout: string;
  optAboutBody: string;
  optTestSampleLabel: string;
  optTestRespondedIn: (ms: number) => string;
  optTestFailed: (provider: string) => string;
}

const en: Strings = {
  searchNotes: "Search notes",
  allNotes: "All notes",
  unsorted: "Unsorted",
  filterByFolder: "Filter by folder",
  filterByTag: "Filter by tag",
  allTags: "All tags",
  noTags: "No tags yet",
  newBtn: "New",
  newFolder: "New folder",
  folderName: "Folder name?",
  deleteFolder: "Delete folder",
  deleteFolderConfirm: (name, count) =>
    count === 0
      ? `Delete folder "${name}"?`
      : `"${name}" has ${count} note${count === 1 ? "" : "s"}. How should they be handled?`,
  deleteFolderAndNotes: "Delete folder & notes",
  deleteFolderKeepNotes: "Delete folder, keep notes",
  manageFolders: "Manage folders",
  foldersPageTitle: "Folders",
  foldersEmpty: "No folders yet",
  foldersEmptyHint: "Create a folder below to start organizing.",
  foldersCreatePlaceholder: "New folder name",
  foldersNoteCount: (n) => `${n} note${n === 1 ? "" : "s"}`,
  renameFolder: "Rename",
  save: "Save",
  more: "More",
  saveSelectedText: "Save selected text",
  saveWholePage: "Save whole page",
  settings: "Settings",
  loading: "Loading…",
  noMatches: "No matches",
  noMatchesHint: "Try a different query.",
  emptyTitle: "Your second brain is empty",
  emptyHint: "Capture from a webpage or create a blank note.",
  newNote: "+ New note",
  noFilterMatches: "No notes match this filter",
  noFilterMatchesHint: "Try a different folder or tag — or clear filters to see everything.",
  clearFilters: "Clear filters",
  sort: "Sort",
  sortUpdated: "Recently updated",
  sortCreated: "Recently created",
  sortAz: "Title A → Z",
  sortZa: "Title Z → A",
  autoOrganize: "Auto-organize",
  autoOrganizeTitle: "AI-organize notes into folders",
  autoOrganizeRunning: "Analyzing notes…",
  autoOrganizePlanHeader: "Proposed folder structure",
  autoOrganizeAccept: "Apply",
  autoOrganizeCancel: "Cancel",
  autoOrganizeNoNotes: "Need at least 2 notes to organize.",
  autoOrganizeParseErr: "Could not parse AI response. Try again.",
  autoOrganizeApplying: "Moving notes into folders…",
  autoOrganizeDone: (folders, notes) => `Created ${folders} folder${folders === 1 ? "" : "s"}, moved ${notes} note${notes === 1 ? "" : "s"}.`,
  autoOrganizeDoneAssign: (notes) => `Assigned ${notes} note${notes === 1 ? "" : "s"} to existing folders.`,
  autoOrganizeFolderCount: (count) => `${count} note${count === 1 ? "" : "s"}`,
  autoOrganizeNoFolders: "Create at least one folder first — auto-organize assigns notes into folders you already have.",
  autoOrganizeNoUnsorted: "Every note is already in a folder. Nothing to assign.",
  autoOrganizeNoFit: "The AI didn't find a confident match for any unsorted note. Try creating more thematic folders first.",
  errPageUnreadable: "Couldn't read this page (try refreshing it).",
  errNoSelection: "No text selected on the current page.",
  errPageEmpty: "Page has no readable text.",
  recordMeeting: "Record Google Meet",
  meetRecordingTitle: "Recording meeting",
  meetScanning: "Looking for a Google Meet tab…",
  meetNoTab: "No Google Meet tab open",
  meetNoTabHint: "Open a meeting at meet.google.com, then come back here.",
  meetStart: "Start recording",
  meetStartFor: (title) => `Start recording "${title}"`,
  meetStopSave: "Stop & save",
  meetDiscard: "Discard",
  meetCaptionsOn: "Captions detected",
  meetCaptionsOff: "Captions not detected",
  meetCaptionsOffHint: "Turn on captions in Meet (CC button) — Memex records the live caption stream.",
  meetSaved: "Meeting saved as note",
  meetDuration: (mmss) => `Duration: ${mmss}`,
  meetEmptyTranscript: "No transcript yet — speak up or check captions.",
  meetBack: "Back to notes",
  meetFallbackTitle: "Meeting",
  meetInjectFailed: (reason) => `Cannot inject Memex into this tab: ${reason}`,
  meetScriptMissing: "Meet content script not found in manifest.",
  meetNoteHeading: "Meeting",
  meetTranscriptHeading: "Transcript",
  meetNoteEmpty: "_(no captions captured)_",
  meetReloadHint: "Tip: if this tab was open before Memex was reloaded, refresh it or reload the extension and try again.",
  hostNotRegistered: "Native host not registered.",
  hostNotRegisteredAfter: "Then quit Chrome and reopen.",
  dismiss: "Dismiss",
  back: "Back",
  moveToFolder: "Move to folder",
  deleteNote: "Delete note",
  saving: "Saving…",
  edited: "Edited",
  saved: "Saved",
  untitled: "Untitled",
  confirmDelete: (title) => `Delete "${title}"?`,
  addTags: "Add tags…",
  removeTag: "Remove",
  startWriting: "Start writing…",
  rtH1: "Heading 1",
  rtH2: "Heading 2",
  rtBold: "Bold",
  rtItalic: "Italic",
  rtStrike: "Strikethrough",
  rtCode: "Inline code",
  rtBullet: "Bullet list",
  rtNumbered: "Numbered list",
  rtTodo: "Todo list",
  rtQuote: "Quote",
  rtCodeBlock: "Code block",
  cancel: "Cancel",
  streaming: "streaming…",
  appendToNote: "Append to note",
  replaceNote: "Replace note",
  replaceSelection: "Replace selection",
  insertAfter: "Insert after",
  appendToEnd: "Append to end",
  copy: "Copy",
  discard: "Discard",
  autoTitleTags: "Auto title / tags",
  autoTitleTagsTitle: "Auto-derive a title and tags from the note",
  autoMetaParseErr: (msg) => `auto-meta parse: ${msg}`,
  selectionLabel: (chars) => `selection · ${chars} chars`,
  wholeNoteLabel: "whole note",
  modeLabel: {
    summarize: "Summarize",
    organize: "Organize",
    brainstorm: "Brainstorm",
    improve: "Improve writing",
    "extract-tasks": "Extract tasks",
    research: "Research assistant",
  },
  modeHint: {
    summarize: "Concise, structured summary with the key points first",
    organize: "Rewrite into clean structured markdown",
    brainstorm: "Fresh angles and adjacent ideas",
    improve: "Clearer writing, same voice and intent",
    "extract-tasks": "Actionable tasks with owners and deadlines",
    research: "Identify open questions and what to investigate next",
  },
  optTitle: "Memex · settings",
  optNativeHost: "Native host",
  optRecheck: "Re-check",
  optPinging: "Pinging native host…",
  optHostUnreachable: "Host unreachable.",
  optHostVersion: "Host version",
  optNode: "Node",
  optClaudeCli: "claude CLI",
  optNotOnPath: "not on PATH",
  optSqliteDb: "SQLite DB",
  optExtensionId: "Extension ID",
  optAiProvider: "AI provider",
  optTestConn: "Test connection",
  optTesting: "Testing…",
  optTestConnTip: "Test the chosen provider",
  optTestNeedsHostTip: "Native host must be reachable first",
  optSave: "Save",
  optSavedFlash: "Saved ✓",
  optProvider: "Provider",
  optClaudeCliOpt: "Claude CLI (local)",
  optOpenaiOpt: "OpenAI API",
  optOllamaOpt: "Ollama (local)",
  optOpenaiKey: "OpenAI API key",
  optModel: "Model",
  optOllamaUrl: "Ollama URL",
  optClaudeHint: "Uses your local claude CLI auth. No API key needed.",
  optAppearance: "Appearance",
  optThemeDark: "Dark",
  optThemeLight: "Light",
  optThemeSystem: "System",
  optThemeHint: "System follows your OS dark-mode preference. Persisted in localStorage so it loads instantly.",
  optLanguage: "Language",
  optLangVi: "Tiếng Việt",
  optLangEn: "English",
  optAbout: "About",
  optAboutBody: "Memex stores all notes locally in SQLite via the native host. The chosen AI provider runs on your machine (Claude CLI / Ollama) or against your own API key (OpenAI) — there is no Memex backend. The name nods to Vannevar Bush's 1945 essay As We May Think.",
  optTestSampleLabel: "Sample",
  optTestRespondedIn: (ms) => `responded in ${ms} ms.`,
  optTestFailed: (p) => `${p} failed:`,
};

const vi: Strings = {
  searchNotes: "Tìm note",
  allNotes: "Tất cả note",
  unsorted: "Chưa phân loại",
  filterByFolder: "Lọc theo thư mục",
  filterByTag: "Lọc theo tag",
  allTags: "Tất cả tag",
  noTags: "Chưa có tag nào",
  newBtn: "Tạo",
  newFolder: "Thư mục mới",
  folderName: "Tên thư mục?",
  deleteFolder: "Xoá thư mục",
  deleteFolderConfirm: (name, count) =>
    count === 0
      ? `Xoá thư mục "${name}"?`
      : `Thư mục "${name}" có ${count} note. Bạn muốn xử lý thế nào?`,
  deleteFolderAndNotes: "Xoá cả thư mục & note",
  deleteFolderKeepNotes: "Chỉ xoá thư mục, giữ note",
  manageFolders: "Quản lý thư mục",
  foldersPageTitle: "Thư mục",
  foldersEmpty: "Chưa có thư mục nào",
  foldersEmptyHint: "Tạo một thư mục bên dưới để bắt đầu sắp xếp.",
  foldersCreatePlaceholder: "Tên thư mục mới",
  foldersNoteCount: (n) => `${n} note`,
  renameFolder: "Đổi tên",
  save: "Lưu",
  more: "Thêm",
  saveSelectedText: "Lưu phần đã chọn",
  saveWholePage: "Lưu cả trang",
  settings: "Cài đặt",
  loading: "Đang tải…",
  noMatches: "Không có kết quả",
  noMatchesHint: "Thử từ khoá khác.",
  emptyTitle: "Bộ não thứ hai còn trống",
  emptyHint: "Lấy nội dung từ một trang web hoặc tạo note trắng.",
  newNote: "+ Note mới",
  noFilterMatches: "Không có note nào khớp filter",
  noFilterMatchesHint: "Thử folder hoặc tag khác — hoặc clear filter để xem toàn bộ.",
  clearFilters: "Clear filter",
  sort: "Sắp xếp",
  sortUpdated: "Mới cập nhật",
  sortCreated: "Mới tạo",
  sortAz: "Tiêu đề A → Z",
  sortZa: "Tiêu đề Z → A",
  autoOrganize: "Tự sắp xếp",
  autoOrganizeTitle: "Để AI gom note vào các thư mục",
  autoOrganizeRunning: "Đang phân tích note…",
  autoOrganizePlanHeader: "Đề xuất cấu trúc thư mục",
  autoOrganizeAccept: "Áp dụng",
  autoOrganizeCancel: "Huỷ",
  autoOrganizeNoNotes: "Cần ít nhất 2 note để sắp xếp.",
  autoOrganizeParseErr: "Không parse được phản hồi AI. Thử lại.",
  autoOrganizeApplying: "Đang di chuyển note vào folder…",
  autoOrganizeDone: (folders, notes) => `Đã tạo ${folders} folder, di chuyển ${notes} note.`,
  autoOrganizeDoneAssign: (notes) => `Đã xếp ${notes} note vào folder có sẵn.`,
  autoOrganizeFolderCount: (count) => `${count} note`,
  autoOrganizeNoFolders: "Tạo ít nhất một folder trước — auto-organize chỉ xếp note vào folder có sẵn, không tạo folder mới.",
  autoOrganizeNoUnsorted: "Mọi note đều đã ở trong folder. Không có gì để xếp.",
  autoOrganizeNoFit: "AI không tìm được folder phù hợp cho bất kỳ note nào. Tạo thêm folder theo chủ đề rõ ràng hơn thử nhé.",
  errPageUnreadable: "Không đọc được trang này (thử reload).",
  errNoSelection: "Chưa chọn đoạn text nào trên trang.",
  errPageEmpty: "Trang không có nội dung text.",
  recordMeeting: "Ghi lại Google Meet",
  meetRecordingTitle: "Đang ghi cuộc họp",
  meetScanning: "Đang tìm tab Google Meet…",
  meetNoTab: "Chưa có tab Google Meet nào",
  meetNoTabHint: "Mở meet.google.com để vào cuộc họp, rồi quay lại đây.",
  meetStart: "Bắt đầu ghi",
  meetStartFor: (title) => `Bắt đầu ghi "${title}"`,
  meetStopSave: "Dừng & lưu",
  meetDiscard: "Bỏ",
  meetCaptionsOn: "Đã thấy phụ đề",
  meetCaptionsOff: "Chưa thấy phụ đề",
  meetCaptionsOffHint: "Bật phụ đề trong Meet (nút CC) — Memex ghi lại stream phụ đề trực tiếp.",
  meetSaved: "Đã lưu cuộc họp thành note",
  meetDuration: (mmss) => `Thời lượng: ${mmss}`,
  meetEmptyTranscript: "Chưa có nội dung — chờ ai đó nói hoặc kiểm tra phụ đề.",
  meetBack: "Về danh sách note",
  meetFallbackTitle: "Cuộc họp",
  meetInjectFailed: (reason) => `Không inject được Memex vào tab này: ${reason}`,
  meetScriptMissing: "Không tìm thấy content script Meet trong manifest.",
  meetNoteHeading: "Cuộc họp",
  meetTranscriptHeading: "Nội dung cuộc họp",
  meetNoteEmpty: "_(không có phụ đề nào được ghi lại)_",
  meetReloadHint: "Mẹo: nếu tab này mở trước khi reload Memex, hãy refresh tab hoặc reload extension rồi thử lại.",
  hostNotRegistered: "Native host chưa register.",
  hostNotRegisteredAfter: "Sau đó quit Chrome và mở lại.",
  dismiss: "Đóng",
  back: "Quay lại",
  moveToFolder: "Chuyển vào thư mục",
  deleteNote: "Xoá note",
  saving: "Đang lưu…",
  edited: "Đã chỉnh",
  saved: "Đã lưu",
  untitled: "Chưa đặt tên",
  confirmDelete: (title) => `Xoá "${title}"?`,
  addTags: "Thêm tag…",
  removeTag: "Xoá",
  startWriting: "Bắt đầu viết…",
  rtH1: "Tiêu đề 1",
  rtH2: "Tiêu đề 2",
  rtBold: "Đậm",
  rtItalic: "Nghiêng",
  rtStrike: "Gạch ngang",
  rtCode: "Code inline",
  rtBullet: "Danh sách",
  rtNumbered: "Danh sách số",
  rtTodo: "Danh sách todo",
  rtQuote: "Trích dẫn",
  rtCodeBlock: "Khối code",
  cancel: "Huỷ",
  streaming: "đang stream…",
  appendToNote: "Thêm vào cuối",
  replaceNote: "Thay toàn bộ",
  replaceSelection: "Thay đoạn đã chọn",
  insertAfter: "Chèn ngay sau",
  appendToEnd: "Thêm vào cuối note",
  copy: "Copy",
  discard: "Bỏ",
  autoTitleTags: "Tự đặt title / tag",
  autoTitleTagsTitle: "Để AI tự suy ra title và tag từ nội dung note",
  autoMetaParseErr: (msg) => `lỗi parse auto-meta: ${msg}`,
  selectionLabel: (chars) => `đã chọn · ${chars} ký tự`,
  wholeNoteLabel: "cả note",
  modeLabel: {
    summarize: "Tóm tắt",
    organize: "Sắp xếp",
    brainstorm: "Brainstorm",
    improve: "Viết lại",
    "extract-tasks": "Trích task",
    research: "Trợ lý nghiên cứu",
  },
  modeHint: {
    summarize: "Tóm tắt gọn, có cấu trúc, điểm quan trọng đầu",
    organize: "Viết lại thành markdown gọn gàng có cấu trúc",
    brainstorm: "Gợi mở góc nhìn mới và ý tưởng liên quan",
    improve: "Viết rõ ràng hơn, giữ giọng điệu và ý gốc",
    "extract-tasks": "Liệt kê task có owner và deadline (nếu có)",
    research: "Tìm câu hỏi mở và hướng tìm hiểu tiếp",
  },
  optTitle: "Memex · cài đặt",
  optNativeHost: "Native host",
  optRecheck: "Kiểm tra lại",
  optPinging: "Đang ping native host…",
  optHostUnreachable: "Không kết nối được host.",
  optHostVersion: "Phiên bản host",
  optNode: "Node",
  optClaudeCli: "claude CLI",
  optNotOnPath: "không có trong PATH",
  optSqliteDb: "SQLite DB",
  optExtensionId: "Extension ID",
  optAiProvider: "AI provider",
  optTestConn: "Kiểm tra kết nối",
  optTesting: "Đang test…",
  optTestConnTip: "Test provider đang chọn",
  optTestNeedsHostTip: "Native host phải reachable trước",
  optSave: "Lưu",
  optSavedFlash: "Đã lưu ✓",
  optProvider: "Provider",
  optClaudeCliOpt: "Claude CLI (local)",
  optOpenaiOpt: "OpenAI API",
  optOllamaOpt: "Ollama (local)",
  optOpenaiKey: "OpenAI API key",
  optModel: "Model",
  optOllamaUrl: "Ollama URL",
  optClaudeHint: "Dùng auth local của claude CLI. Không cần API key.",
  optAppearance: "Giao diện",
  optThemeDark: "Tối",
  optThemeLight: "Sáng",
  optThemeSystem: "Theo hệ thống",
  optThemeHint: "Theo hệ thống = dùng setting dark-mode của OS. Lưu trong localStorage để load tức thì.",
  optLanguage: "Ngôn ngữ",
  optLangVi: "Tiếng Việt",
  optLangEn: "English",
  optAbout: "Giới thiệu",
  optAboutBody: "Memex lưu toàn bộ note local trong SQLite qua native host. AI provider chạy trên máy bạn (Claude CLI / Ollama) hoặc dùng API key riêng của bạn (OpenAI) — không có backend của Memex. Tên gọi lấy cảm hứng từ bài essay 1945 As We May Think của Vannevar Bush.",
  optTestSampleLabel: "Mẫu",
  optTestRespondedIn: (ms) => `phản hồi trong ${ms} ms.`,
  optTestFailed: (p) => `${p} thất bại:`,
};

const TABLES: Record<Lang, Strings> = { en, vi };

/** Get the current strings table. Read on each call so changes propagate. */
export function t(): Strings {
  return TABLES[getLang()];
}

/** Reactive variant — returns strings AND re-renders when lang changes. */
export function useT(): Strings {
  const [lang] = useLang();
  return TABLES[lang];
}

// ---------- For the host AI prompt ----------

/**
 * Prepended to every AI prompt so the model replies in the user's language.
 * Kept short and imperative — long instructions waste tokens.
 */
export function aiLanguageDirective(lang: Lang = getLang()): string {
  return lang === "vi"
    ? "Reply in Vietnamese (tiếng Việt). Keep markdown formatting."
    : "Reply in English. Keep markdown formatting.";
}
