
## 2024-05-30 - Tooltips for icon-only buttons
**Learning:** Icon-only buttons with `aria-label` are accessible to screen readers, but sighted mouse/pointer users also need a way to understand what the button does. `aria-label` does not generate a visual tooltip on hover.
**Action:** Always add a native `title` attribute (or a custom tooltip component) matching the `aria-label` text to icon-only buttons. Additionally, explicit `aria-hidden="true"` should be placed on the SVG icons inside such buttons to prevent any redundant screen reader announcements.
