## What & why

<!-- What does this PR change, and why? Link any related issue (e.g. Closes #123). -->

## Type of change

<!-- Match the conventional-commit type of your commits — it drives the next version. -->

- [ ] `feat` — new functionality (minor release)
- [ ] `fix` — bug fix (patch release)
- [ ] `docs` / `chore` / `test` / `refactor` / `ci` — no release
- [ ] breaking change (`feat!`/`fix!` or `BREAKING CHANGE:` — major release)

## Checklist

- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass locally (the pre-commit hook runs these)
- [ ] Tests added or updated for the change
- [ ] Public API changes are reflected in the `README`
- [ ] The library still imports nothing from `typeorm` (version-safety is the point)

## Notes

<!-- Anything reviewers should know: trade-offs, follow-ups, screenshots, etc. -->
