## 2024-05-30 - Tooltips for icon-only buttons
**Learning:** Icon-only buttons with `aria-label` are accessible to screen readers, but sighted mouse/pointer users also need a way to understand what the button does. `aria-label` does not generate a visual tooltip on hover.
**Action:** Always add a native `title` attribute (or a custom tooltip component) matching the `aria-label` text to icon-only buttons. Additionally, explicit `aria-hidden="true"` should be placed on the SVG icons inside such buttons to prevent any redundant screen reader announcements.

## 2026-05-29 - Surfacing Keyboard Shortcuts
**Learning:** This application had existing keyboard shortcuts (Ctrl+Enter for submit, Esc for reset) implemented as document-level listeners, but they were entirely invisible to users. Adding visual kbd hints and aria-keyshortcuts makes these hidden features discoverable.
**Action:** When working on forms, always check if keyboard shortcuts exist in the component logic and ensure they are exposed in the UI.
