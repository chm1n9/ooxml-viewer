# ooxml-file

Static web app to open XML-based Office packages (documents, templates, slide shows, add-ins, and themes), browse contents as a tree, edit XML, and repack & download.

## Features

- **Open OOXML:** Drop a file anywhere on the upload page (the upload card highlights), or click the card to choose XML-based Office packages using the same OPC relationship rules. PowerPoint: `.pptx`, `.pptm`, `.potx`, `.potm`, `.ppsx`, `.ppsm`, `.ppam`; Word: `.docx`, `.docm`, `.dotx`, `.dotm`; Excel: `.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.xlam`; themes: `.thmx`. Legacy `.ppt`, `.doc`, `.xls`, binary `.xlsb`, ODF and EPUB are excluded. Macro payloads remain binary and are preserved during repacking; they are not executed. Format scope follows [Microsoft’s XML extension reference](https://learn.microsoft.com/en-us/office/compatibility/xml-file-name-extension-reference-for-office).
- **Binary files:** Unsupported binary parts show a generic file icon, filename and preview-unavailable message, with the path and Relations toolbar. Their original bytes are preserved on export.
- **Office themes:** Open `.thmx` packages to browse and edit theme XML and relationships, preview thumbnails, and preserve embedded fonts and other binary resources when saving as `.thmx`.
- **File tree:** Left sidebar shows entries as a folder tree; expand/collapse with › indicator.
- **Find files:** Filter file names without case sensitivity, retain parent folders, clear the filter with Escape, or collapse all folders outside filtering mode.
- **Editor / preview:** Right side shows XML editor for text parts, image preview for `/media/` and image extensions.
- **XML validation and file revert:** After 450 ms without typing, XML parts are checked for well-formedness. The editor footer shows errors with a clickable line/column location when the browser provides it. This does not validate Office schemas. Revert current file restores its last export baseline after confirmation, preserves other files, and can itself be undone.
- **Inline diff:** Editing XML automatically shows deleted original lines in red and current additions in green, with character-level highlights. The Diff toggle hides or shows the comparison without changing content or undo history. Its global preference is saved locally across file navigation and reloads (enabled by default), with a shaded button when enabled. Diff controls appear in a compact editor footer only when the current file has changes, leaving the path toolbar for navigation and formatting. When enabled, Changes shows the number of changed blocks; Previous/Next buttons center each change, unfold its containing region, and wrap at either end. The label shows the current change when the cursor is inside one. Each diff block has a Revert button that restores only that block; the revert itself can be undone with Cmd/Ctrl + Z. Deleted lines are display-only. Comparison uses the current export baseline (initial formatting is excluded), and successful downloads update it.
- **Editor search:** Switching files preserves the search panel, query, replacement text, and search options, and recalculates matches in the new document. Search state stays in memory for the open package and resets when it is closed or replaced.
- **XML navigation:** Hover over relationship IDs or internal file paths in XML attributes to preview the target. Cmd/Ctrl + click opens the file; ordinary clicks continue editing. The hover preview also offers a clickable target. Only existing package files are opened; external relationships are excluded.
- **Relations:** The path toolbar groups internal related parts under “Relations ↑outgoing ↓incoming”, with matching arrows in References and Referenced by section headings. Both directional counts include zero; external links are excluded. Hover to open a right-aligned list of related files; moving into the list keeps it open. Enter or Arrow Down also opens it for keyboard navigation. Click a file to navigate; move away, click outside, or press Escape to close.
- **Edit & download:** Edit XML in place with undo/redo; "Download" repacks the ZIP into a new file. Unexported changes are marked in the tree and header, with a discard confirmation before closing or replacing the file and a browser warning before leaving the page.
- **Download shortcut:** Use `⌘S` on macOS or `Ctrl+S` on Windows/Linux to export changes. With no changes, a notice appears instead of downloading again. Shortcuts are suppressed while a dialog is open or an export is in progress.
- **Dev:** In development, the first `.pptx` in `public/` is auto-loaded on start (port 8800).

## UI Overview

- **Empty state:** Centered document/code logo, “OOXML Viewer” title, short description, and a drop zone listing supported formats; dashed border and hover highlight. The logo also serves as the browser favicon.
- **With file open:**
  - **Header:** File name and unexported change count on the left; “Close file”, “Download”, Settings, and GitHub controls on the right.
  - **Left panel (Files):** Tree with “Files” title; folders use › (rotates 90° when expanded), fixed-width chevron column; files show name; selected row highlighted; independent scroll.
  - **Right area:** Path bar at top; below either XML editor (monospace, editable for non-binary) or image preview (centered, contained); independent scroll.
- **Styling:** UnoCSS; gray/blue palette; rounded controls; dark mode supported; minimal margins (global reset on `html`/`body`/`#app`).

## Tech

- Svelte 4, TypeScript, Vite 6, pnpm, UnoCSS, JSZip.

The inline diff uses the official CodeMirror `@codemirror/merge` package, pinned to `6.12.3` from the npm registry; its dependency integrity is recorded in `pnpm-lock.yaml`. It runs locally and does not upload document content.
