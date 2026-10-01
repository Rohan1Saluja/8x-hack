# Frontend conventions

Use Tailwind utilities directly in components for layout, spacing, typography, responsive behavior, and interaction states.

- `src/app/globals.css` contains only the Tailwind import and shared `@theme` tokens.
- `src/app/layout.tsx` applies the document's background, font, and default text styles.
- `src/components/ui/button.tsx` shares primary, secondary, destructive, and text button styles. Pass normal button props and use `variant` and `size` for its appearance.
- Keep complete utility class names in source so Tailwind can detect conditional states. Avoid constructing class names from fragments or adding global component selectors.
- Preserve focus-visible, disabled, and small-screen styles when changing controls.

Run `pnpm typecheck`, `pnpm build`, and `pnpm test:frontend-http` from the repository root.
