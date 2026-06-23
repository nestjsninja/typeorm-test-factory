# Contributing

Thanks for helping improve **typeorm-test-factory**.

## Getting started

Requires Node 22+.

```bash
git clone https://github.com/nestjsninja/typeorm-test-factory.git
cd typeorm-test-factory
npm install   # also installs the husky git hooks
```

## Workflow

`main` is protected — changes land through pull requests.

1. Branch off `main`: `git checkout -b feat/my-change`
2. Make your change.
3. Commit. A **pre-commit hook** runs `lint`, `typecheck`, and the test suite; the commit is blocked if anything fails.
4. Push and open a pull request against `main`.
5. CI must be green. Two checks run against a PostgreSQL service container:
   - **Library** — lint, build, the SQLite + PostgreSQL test suites
   - **NestJS example** — service integration + HTTP e2e tests
6. Merge once approved and green.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). The prefix drives the next version and the changelog:

- `feat:` → minor release, listed under **Features**
- `fix:` → patch release, listed under **Bug Fixes**
- `chore:`, `docs:`, `test:`, `refactor:`, `ci:` → no release, kept out of the changelog
- a `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` footer → major release

## Scripts

```bash
npm test            # Jest (SQLite suites; the PostgreSQL suite is skipped unless POSTGRES_HOST is set)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run lint:fix    # ESLint --fix
npm run build       # emit dist/
```

### Running the PostgreSQL suite locally

```bash
docker run -d --name ttf-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test -p 5433:5432 postgres:16

POSTGRES_HOST=localhost POSTGRES_PORT=5433 POSTGRES_USER=test \
  POSTGRES_PASSWORD=test POSTGRES_DB=test npm test
```

### The example app

`examples/nestjs` is a runnable NestJS app with its own tests. It resolves the
library from `dist/`, so build first:

```bash
npm run build
cd examples/nestjs
npm install
npm test
```

## Releasing (maintainers)

Releases are automated, and the npm token lives only in GitHub Actions — never on a developer machine.

From an up-to-date, clean `main`:

```bash
npm run release                # preview first with: npm run release -- --dry-run
```

[release-it](https://github.com/release-it/release-it) bumps the version from the
commit history, updates `CHANGELOG.md`, commits, tags `v<version>`, and pushes.
Pushing the tag triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml),
which builds, tests, runs `npm publish --provenance`, and creates the GitHub release.

Notes:

- Because `main` requires pull requests, the release commit is pushed directly by a
  repository **admin** (branch protection is not enforced for administrators).
- The `NPM_TOKEN` repository secret must be an npm **automation** token.
- Provenance requires a `repository` field in `package.json` and a public repository.
