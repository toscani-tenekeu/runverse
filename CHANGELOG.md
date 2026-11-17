# Changelog

Notable changes to Runverse. Dates are YYYY-MM-DD.

## 2026-11-17

### Changed
- The editor is rebuilt with shadcn/ui and Tailwind CSS in a compact, VS Code-like layout: activity bar, file explorer with file-type icons and a right-click menu, tabs and breadcrumbs, the terminal as a bottom panel, and a slim status bar. Panels are resized by dragging and remembered.
- `Ctrl+P` opens a command palette: files and editor commands in one list.
- The language picker is searchable.

### Added
- Frameworks next to the languages: React, Vue, Svelte, Preact, Alpine.js and Tailwind CSS run in the browser; Laravel, Django, Flask, FastAPI and Express run in the sandbox, with an address bar in the preview where each request runs the app.
- `/editor` is a start page with languages and frameworks in two groups, and the editor's picker groups them too.
- The terminal of a backend framework project runs its tools (`php artisan`, `python manage.py`).
- `./scripts/languages.sh laravel django flask fastapi express` (or `frameworks`) installs the backend frameworks.

### Changed
- Piston's output limit is 2 MB, so a framework's pages fit.

## 2026-11-05

### Added
- First release: the editor with 24 languages plus HTML, CSS and JS, share links, file trees, and self-hosting with Docker Compose.
- Modern toolchains: .NET 8 (C#), Java 21, the latest Go, Node.js 22, and C17/C++20 for C and C++.
- Export a workspace as a `.zip`.
- API waitlist: the "API Reference" footer link opens a sign-up form.

### Changed
- Reset, Export and Share are now icon buttons with tooltips.
- Landing page: GitHub icon in the nav, and GitHub and editor buttons replace the "code is public" box.
