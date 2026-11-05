import type { LibraryKind } from '@shared/library'

export type { LibraryKind }

export type LibraryItem = {
  id: string
  name: string
  desc: string
  repo: string | null
  path: string
  body: string
  draft?: string
  saved: string
  uses: number
}

export type LibrarySection = {
  title: string
  noun: string
  blurb: string
  selected: string
  items: LibraryItem[]
}

export function libraryFile(kind: LibraryKind, name: string): string {
  if (kind === 'skills') return `skills/${name}/SKILL.md`
  if (kind === 'instructions') return `rules/${name}.md`
  if (kind === 'hooks') return `hooks/${name}`
  if (kind === 'mcp') return '.mcp.json'
  return `${kind}/${name}.md`
}

export function libraryPath(kind: LibraryKind, name: string): string {
  return `~/Kokpit/${libraryFile(kind, name)}`
}

const md = (lines: string[]) => lines.join('\n')

const REVIEW_PR = (step3: string, step4: string) =>
  md([
    '---',
    'name: review-pr',
    'description: Review a pull request for correctness, tests and security before approving.',
    'scope: global',
    '---',
    '',
    '# Review PR',
    '',
    'When asked to review a pull request:',
    '',
    '1. Fetch the diff with `gh pr diff <number>` and read the linked Jira task.',
    '2. Check every changed function has a test, or explain why not.',
    step3,
    step4,
    '',
    '## Output',
    '',
    '- **Verdict:** approve / request changes / needs discussion',
    '- **Blocking issues** with file:line references',
    '- **Nits** grouped at the end, max 5',
    '',
    '## Don’t',
    '',
    '- Rewrite the author’s code style unless the repo rules say so.',
    '- Comment on formatting that Prettier would fix.'
  ])

const skill = (
  name: string,
  desc: string,
  repo: string | null,
  body: string[],
  saved: string,
  uses: number
): LibraryItem => ({
  id: `skills/${name}`,
  name,
  desc,
  repo,
  path: libraryPath('skills', name),
  body: md(['---', `name: ${name}`, `description: ${desc}`, `scope: ${repo ?? 'global'}`, '---', '', ...body]),
  saved,
  uses
})

const agent = (
  name: string,
  desc: string,
  repo: string | null,
  body: string[],
  saved: string,
  uses: number
): LibraryItem => ({
  id: `agents/${name}`,
  name,
  desc,
  repo,
  path: libraryPath('agents', name),
  body: md(['---', `name: ${name}`, `description: ${desc}`, '---', '', ...body]),
  saved,
  uses
})

const rule = (
  name: string,
  desc: string,
  repo: string | null,
  path: string,
  body: string[],
  saved: string
): LibraryItem => ({ id: `rules/${name}`, name, desc, repo, path, body: md(body), saved, uses: 0 })

export const MOCK_LIBRARY: Record<LibraryKind, LibrarySection> = {
  skills: {
    title: 'Skills',
    noun: 'skill',
    blurb: 'Reusable procedures Claude can invoke by name. They load in every Kokpit session as kokpit:<name>.',
    selected: 'skills/review-pr',
    items: [
      {
        id: 'skills/review-pr',
        name: 'review-pr',
        desc: 'Review a pull request for correctness, tests and security before approving.',
        repo: null,
        path: libraryPath('skills', 'review-pr'),
        body: REVIEW_PR(
          '3. Flag endpoints that write without validating their input.',
          '4. Approve on GitHub when there are no blocking issues.'
        ),
        draft: REVIEW_PR(
          '3. Flag mutating endpoints that don’t check idempotency before writing.',
          '4. Never approve on GitHub yourself — summarise and let me decide.'
        ),
        saved: 'Saved 2 days ago',
        uses: 7
      },
      skill(
        'write-migration',
        'Create a Prisma migration with safety checks and a rollback note.',
        'checkout-service',
        [
          '# Write migration',
          '',
          'Use when a change needs a schema update in checkout-service.',
          '',
          '1. Edit `prisma/schema.prisma`, then run `pnpm prisma migrate dev --create-only --name <change>`.',
          '2. Read the generated SQL. Flag any `ALTER TABLE` that rewrites a table with more than 1M rows.',
          '3. Split column renames into add, backfill and drop across separate deploys.',
          '4. Add a `-- rollback:` note at the top of the migration with the exact reverse SQL.',
          '',
          '## Never',
          '',
          '- Run `migrate reset` or `db push` against a shared database.',
          '- Backfill inside the migration itself; write a job in `scripts/backfills` instead.'
        ],
        'Saved last week',
        3
      ),
      skill(
        'release-notes',
        'Summarise merged PRs since the last tag into customer-facing notes.',
        null,
        [
          '# Release notes',
          '',
          '1. Find the last tag with `git describe --tags --abbrev=0`.',
          '2. List merged PRs since then with `gh pr list --state merged --search "merged:>=<tag date>"`.',
          '3. Group changes under **New**, **Improved** and **Fixed**.',
          '4. Write each line for a customer, not an engineer: what changed and why it matters.',
          '',
          '## Leave out',
          '',
          '- Internal refactors, dependency bumps and CI changes.',
          '- Ticket keys and PR numbers.'
        ],
        'Saved 3 weeks ago',
        1
      ),
      skill(
        'jira-sync',
        'Post plan or progress summaries as comments on the linked Jira task.',
        null,
        [
          '# Jira sync',
          '',
          'Find the Jira key from the branch name (for example `feat/PAY-1284-retries`).',
          '',
          '1. Summarise the plan or the progress in at most five bullets.',
          '2. Show me the comment before posting it.',
          '3. Post it with the Jira tool and paste the comment link back here.',
          '',
          'Write the comment in plain English. Link the PR when there is one.'
        ],
        'Saved 5 days ago',
        12
      ),
      skill(
        'test-writer',
        'Write Vitest unit tests that follow the repo’s fixture conventions.',
        'web',
        [
          '# Test writer',
          '',
          '1. Put the test next to the source file as `<name>.test.ts`.',
          '2. Build data with the factories in `test/factories`; never inline model literals.',
          '3. Mock network calls with `msw` handlers from `test/handlers`.',
          '4. Run `pnpm vitest run <path>` and make sure the new tests fail without the change.',
          '',
          'One behaviour per `it()`, named as a sentence.'
        ],
        'Saved yesterday',
        5
      ),
      skill(
        'api-docs',
        'Update the OpenAPI spec and examples when a route signature changes.',
        'checkout-service',
        [
          '# API docs',
          '',
          'When a route in `src/routes` changes its params, body or response:',
          '',
          '1. Update `openapi/checkout.yaml` to match.',
          '2. Refresh the request and response examples under `openapi/examples`.',
          '3. Run `pnpm openapi:lint` and fix every error.',
          '',
          'See the [OpenAPI 3.1 spec](https://spec.openapis.org/oas/v3.1.0) for field names.'
        ],
        'Saved 2 weeks ago',
        2
      )
    ]
  },
  agents: {
    title: 'Agents',
    noun: 'agent',
    blurb: 'Specialised sub-agents Claude can delegate work to. They load in every Kokpit session as kokpit:<name>.',
    selected: 'agents/payments-reviewer',
    items: [
      agent(
        'payments-reviewer',
        'Specialist reviewer for money movement: idempotency, rounding, currency.',
        'checkout-service',
        [
          '# Payments reviewer',
          '',
          'Use for any change that touches money movement in checkout-service.',
          '',
          '## Checks',
          '',
          '- Every mutating endpoint verifies the idempotency key before writing.',
          '- Amounts are integers in minor units; no floats anywhere in the path.',
          '- Currency is explicit on every amount and never inferred from the merchant.'
        ],
        'Saved 2 days ago',
        3
      ),
      agent(
        'test-runner',
        'Runs the narrowest test set for a change and reports failures concisely.',
        null,
        [
          '# Test runner',
          '',
          'Run only the tests that cover the changed files, then report.',
          '',
          '1. Find related tests with `pnpm vitest related <files>`.',
          '2. Run them once. If one fails, run it again to rule out a flake.',
          '3. Report each failure as `file:line`, the assertion and one line of cause.',
          '',
          'Never edit source or test files.'
        ],
        'Saved last week',
        18
      ),
      agent(
        'researcher',
        'Reads docs and source to answer technical questions. Never edits files.',
        null,
        [
          '# Researcher',
          '',
          'Answer the question with evidence from the code or the docs.',
          '',
          '- Cite every claim as `path:line` or a link.',
          '- Say **unknown** when the sources do not settle it.',
          '- Keep the answer under 200 words unless asked for more.',
          '',
          'You have read-only tools. Never edit files or run commands that change state.'
        ],
        'Saved 3 weeks ago',
        6
      ),
      agent(
        'db-migrator',
        'Plans and writes schema migrations with rollback steps.',
        'checkout-service',
        [
          '# DB migrator',
          '',
          '1. Write the plan first: tables touched, lock level, expected duration.',
          '2. Write the migration with `pnpm prisma migrate dev --create-only`.',
          '3. Add a rollback section with the exact reverse SQL.',
          '',
          '## Stop and ask',
          '',
          '- Before any change that locks a table for more than a few seconds.',
          '- Before dropping a column that still has reads in `src/`.'
        ],
        'Saved 4 days ago',
        2
      )
    ]
  },
  instructions: {
    title: 'CLAUDE.md',
    noun: 'CLAUDE.md',
    blurb: 'Kokpit adds this file to every session it starts, in any repository. The repository’s own CLAUDE.md still applies on top.',
    selected: 'rules/testing.md',
    items: [
      rule(
        'CLAUDE.md',
        'Global defaults: language, tone, commit style, things to never do.',
        null,
        '~/Kokpit/CLAUDE.md',
        [
          '# Defaults',
          '',
          'Reply in English. Keep answers short and lead with the result.',
          '',
          '## Always',
          '',
          '- Read the code before changing it.',
          '- Make the smallest change that does the job.',
          '- Say what you verified and what you did not.',
          '',
          '## Never',
          '',
          '- Push, merge or open a PR unless I ask.',
          '- Add dependencies without asking.',
          '- Commit secrets or `.env` files.'
        ],
        'Saved 1 week ago'
      ),
      rule(
        'checkout-service/CLAUDE.md',
        'Money as integers, idempotency on POSTs, error code catalogue.',
        'checkout-service',
        'checkout-service/CLAUDE.md',
        [
          '# checkout-service',
          '',
          'Node 22, Fastify, Prisma on Postgres.',
          '',
          '## Money',
          '',
          '- Store and pass amounts as integers in minor units.',
          '- Every amount carries its currency code.',
          '',
          '## API',
          '',
          '- Every `POST` requires an `Idempotency-Key` header.',
          '- Errors use codes from `src/errors/catalogue.ts`; never invent new strings inline.'
        ],
        'Saved 3 days ago'
      ),
      rule(
        'testing.md',
        'How to write and run tests: Vitest, factories, no network in unit tests.',
        null,
        libraryPath('instructions', 'testing'),
        [
          '# Testing',
          '',
          'Applies to every repository unless a repo rule overrides it.',
          '',
          '## Running',
          '',
          '- Unit: `pnpm vitest run <path>` — always scope to the changed folder first.',
          '- Full suite only before pushing: `pnpm test`.',
          '',
          '## Writing tests',
          '',
          '- Use factories from `test/factories`; never inline model literals.',
          '- No real network in unit tests — mock with `msw`.',
          '- One behaviour per `it()`, named as a sentence: *“retries a 503 response with backoff”*.',
          '',
          '## Snapshots',
          '',
          'Avoid new snapshot tests. If you must add one, keep it under 40 lines and explain why in a comment above it.',
          '',
          '```ts',
          "it('retries a 503 response with backoff', async () => {",
          '  const event = webhookEventFactory.build()',
          '  server.use(http.post(event.endpointUrl, () => new HttpResponse(null, { status: 503 })))',
          '  await deliverWebhook(event)',
          "  expect(queue.add).toHaveBeenCalledWith('webhook', event, { delay: 1000 })",
          '})',
          '```'
        ],
        'Saved 2 days ago'
      ),
      rule(
        'commit-style.md',
        'Conventional commits, scope from folder, Jira key in the footer.',
        null,
        libraryPath('instructions', 'commit-style'),
        [
          '# Commit style',
          '',
          'Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).',
          '',
          '- Type is one of `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.',
          '- Scope is the top-level folder that changed, for example `feat(webhooks):`.',
          '- Subject is imperative and under 72 characters.',
          '- Put the Jira key in the footer: `Refs: PAY-1284`.'
        ],
        'Saved 2 weeks ago'
      ),
      rule(
        'web/CLAUDE.md',
        'Next.js app rules: server components first, no client fetch in pages.',
        'web',
        'web/CLAUDE.md',
        [
          '# web',
          '',
          'Next.js 15 with the App Router.',
          '',
          '1. Write server components by default; add `"use client"` only for interactivity.',
          '2. Fetch data in server components or route handlers, never in a client page.',
          '3. Style with Tailwind classes; no new CSS modules.',
          '',
          'Run `pnpm lint && pnpm typecheck` before you say you are done.'
        ],
        'Saved 5 days ago'
      )
    ]
  },
  commands: {
    title: 'Commands',
    noun: 'command',
    blurb: 'Slash commands you can run as /kokpit:<name> in Kokpit sessions.',
    selected: '',
    items: []
  },
  memory: {
    title: 'Memory',
    noun: 'memory',
    blurb: 'What Claude remembers across Kokpit sessions, in every repo. Claude adds to it as you work. MEMORY.md is the index it reads first.',
    selected: '',
    items: []
  },
  hooks: {
    title: 'Hooks',
    noun: 'hook script',
    blurb: 'hooks.json decides when each script runs. Scripts get the event as JSON on stdin.',
    selected: '',
    items: []
  },
  mcp: {
    title: 'MCP servers',
    noun: 'MCP server file',
    blurb: 'Servers listed in .mcp.json start with every Kokpit session.',
    selected: '',
    items: []
  }
}
