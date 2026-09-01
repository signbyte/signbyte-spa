# Self-hosted fonts

The UI uses two open-source typefaces, served from this folder (never a CDN), so
nothing loads from a third-party origin at runtime and the content-security policy
needs no font exception.

Add the variable `woff2` files here:

| File | Family | License |
|---|---|---|
| `HankenGrotesk-Variable.woff2` | Hanken Grotesk (weights 400–800) | SIL Open Font License 1.1 |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono (weights 400–700) | SIL Open Font License 1.1 |

The `@font-face` declarations in `src/assets/main.css` already point here. Until the
files are added the font stacks fall back to the system sans / mono, so the build and
the app still work — only the final typography differs.
