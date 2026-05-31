## 2024-05-29 - Avoid `getComputedStyle` in computed properties or render cycles
**Learning:** Calling `getComputedStyle(document.body)` inside Angular signals or component rendering cycles (like `chartData` and `chartOptions`) triggers synchronous style recalculations. If these signals are re-evaluated frequently (e.g. when data updates), this can cause severe layout thrashing and performance bottlenecks.
**Action:** When a component relies on CSS variables for styling elements (like Chart.js configs), extract the variables via `getComputedStyle` *exactly once* during initialization and on theme toggle. Store the resolved colors in a simple cache object, and read from the cache during regular change detection.

## 2026-05-30 - Avoid synchronous layout thrashing in Angular Signals
**Learning:** Calling `getComputedStyle` inside Angular `computed` signals is a major performance anti-pattern. Because computed properties re-evaluate synchronously whenever their dependencies change, accessing DOM styles repeatedly causes synchronous layout thrashing.
**Action:** When a computed property needs CSS variable values, read all needed styles once (e.g. during initialization or theme toggling), cache them in a dedicated state signal (like `themeColors`), and have the `computed` properties depend on that state signal instead of interacting with the DOM.
