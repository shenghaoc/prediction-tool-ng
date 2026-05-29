## 2026-05-29 - Surfacing Keyboard Shortcuts
**Learning:** This application had existing keyboard shortcuts (Ctrl+Enter for submit, Esc for reset) implemented as document-level listeners, but they were entirely invisible to users. Adding visual kbd hints and aria-keyshortcuts makes these hidden features discoverable.
**Action:** When working on forms, always check if keyboard shortcuts exist in the component logic and ensure they are exposed in the UI.
