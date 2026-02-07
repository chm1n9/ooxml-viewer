# ooxml-file

Static web app to open OOXML files (.pptx / .docx / .xlsx), browse contents as a tree, edit XML, and repack & download.

## Features

- **Open OOXML:** Drag-and-drop or click to choose `.pptx`, `.docx`, `.xlsx` (and legacy `.ppt`, `.doc`, `.xls`).
- **File tree:** Left sidebar shows entries as a folder tree; expand/collapse with › indicator.
- **Editor / preview:** Right side shows XML editor for text parts, image preview for `/media/` and image extensions.
- **Edit & save:** Edit XML in place; "Save & Download" repacks the ZIP and triggers download.
- **Dev:** In development, the first `.pptx` in `public/` is auto-loaded on start (port 8800).

## UI Overview

- **Empty state:** Centered drop zone — “Drop .pptx / .docx / .xlsx here” and “or click to choose file”; dashed border, hover highlight.
- **With file open:**
  - **Header:** File name (truncated) on the left; “Save & Download” button on the right (blue primary).
  - **Left panel (Files):** Tree with “Files” title; folders use › (rotates 90° when expanded), fixed-width chevron column; files show name; selected row highlighted; independent scroll.
  - **Right area:** Path bar at top; below either XML editor (monospace, editable for non-binary) or image preview (centered, contained); independent scroll.
- **Styling:** UnoCSS; gray/blue palette; rounded controls; dark mode supported; minimal margins (global reset on `html`/`body`/`#app`).

## Tech

- Svelte 4, TypeScript, Vite 6, pnpm, UnoCSS, JSZip.
