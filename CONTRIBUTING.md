# Contributing

Thank you for considering a contribution. Bug reports, fixes and improvements are
welcome. For anything that could be exploited, use the private route in
[SECURITY.md](SECURITY.md) — never a public issue.

For anything larger than a small fix, please open an issue first and describe what
you want to change and why. It protects your time: a change that fights the app's
design is better redirected before it is written than after.

## Building and testing

You need Node.js at the version named in [.nvmrc](.nvmrc). Install from the lockfile,
then run the same gate CI runs on every push:

```sh
npm ci
npm run typecheck
npm run test
npm run build
```

`npm run dev` starts the Vite dev server for interactive work. The production output
of `npm run build` lands in `dist/` — a fully static bundle; the app expects its
backend on the same origin under `/api/`.

## Proposing a change

- Work on a branch and open a pull request against `develop`.
- **Sign off every commit.** This project uses the
  [Developer Certificate of Origin](https://developercertificate.org/): by adding a
  `Signed-off-by: Your Name <you@example.org>` line you certify that you wrote the change or
  otherwise have the right to submit it under this project's licence. `git commit -s` adds the line
  for you; the name and address must match the commit author. A pull request whose commits lack it
  fails the DCO check and cannot be merged.
- Keep the change focused: one concern per pull request.
- A change in behaviour comes with a test that fails without it.
- Match the style around you — Vue `<script setup>` single-file components,
  TypeScript throughout, Tailwind for styling. The dependency surface is kept
  deliberately small (native `fetch`, inline SVG icons, CSS motion); a new
  dependency needs a reason the existing ones cannot cover, and pull requests run
  a dependency review.
- User-facing text goes through the i18n catalogues, never hardcoded in a component.

## Licence

This project is licensed under the GNU AGPL-3.0-only (see [LICENSE](LICENSE)). By
submitting a contribution you agree that it is provided under the same licence.
