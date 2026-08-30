\# AGENTS.md



## Source of truth



When instructions conflict, use this precedence:



1. The user's requirements and the current active GitHub issue.
2. This `AGENTS.md` repository contract.
3. Current product documentation such as `README.md`.
4. Dated plans and specs under `docs/superpowers/`.



Completed dated plans and specs under `docs/superpowers/` are historical implementation records. Their `Global Constraints`, implementation steps, and `For agentic workers` instructions are not current requirements unless the active issue explicitly adopts them. Preserve these records as evidence of why the current code exists, not as authority requiring that architecture to remain.



## Current product invariants



* The product name is **Brum**. The GitHub repository may remain named `brumaire` unless a separate request changes it.
* Brum creates Instagram-style boomerang video: motion plays forward and then backward.
* One boomerang loop is one complete forward + reverse cycle.
* MVP generated output is intentionally silent.
* Do not implement reverse playback by reversing H.264 `EncodedPacket` arrays or merely reversing encoded timestamps. Reversing motion requires decoded presentation-order video frames and re-encoding.
* Media processing remains local and on-device. Do not upload user media.
* Prefer the existing Mediabunny/browser media stack before introducing FFmpeg.wasm or server-side processing.
* Exact-duration targets must still produce the requested output duration.



\## General



\* Follow the existing architecture, conventions, and patterns in the repository.

\* Prefer understanding the current implementation before proposing structural changes.

\* Make the smallest coherent change that fully solves the task.

\* Do not introduce abstractions, dependencies, services, or infrastructure without a concrete need.

\* Do not preserve a bad design merely because it already exists. If a materially better approach is warranted, explain the tradeoff and implement it cleanly.

\* Prefer simple, explicit code over clever or highly generalized code.

\* Keep unrelated refactors out of task-specific changes.



\## Autonomy



\* Resolve straightforward implementation details independently.

\* Do not ask for clarification when the answer can reasonably be inferred from the codebase, existing conventions, documentation, or tests.

\* When multiple approaches are valid, choose the one with the best balance of simplicity, maintainability, performance, and compatibility.

\* Revisit earlier assumptions when implementation evidence contradicts them.

\* Treat existing architectural decisions as defaults, not immutable constraints.



\## Token efficiency



Use context deliberately.



\* Search before reading large files.

\* Read only the files and sections necessary for the current task.

\* Prefer targeted symbol, filename, text, and reference searches over broad repository scans.

\* When a relevant location is already known, inspect that location directly instead of rediscovering it.

\* Avoid rereading files that have not changed unless necessary.

\* Do not load generated files, lockfiles, build artifacts, vendored code, or large datasets unless directly relevant.

\* When inspecting long files, start with the relevant range and expand only when needed.

\* Follow imports, callers, tests, and types selectively rather than recursively exploring unrelated code.

\* Reuse information already established during the task instead of repeatedly retrieving it.

\* Do not restate large portions of source code in reasoning or summaries.

\* Keep plans and progress updates concise.

\* Prefer executing a focused command over gathering context speculatively.

\* Stop investigating once enough evidence exists to implement the change confidently.



\## Implementation



\* Preserve type safety.

\* Avoid `any`, unsafe casts, ignored errors, and disabled checks unless there is a concrete interoperability reason.

\* Prefer existing utilities and dependencies when they already solve the problem well.

\* Add a dependency only when it provides meaningful value over a small local implementation.

\* Keep functions and modules focused.

\* Keep business/domain logic separate from presentation code when practical.

\* Handle expected failure modes explicitly.

\* Avoid premature optimization, but do not knowingly introduce unnecessary expensive work on hot paths.

\* Comment non-obvious decisions and constraints, not self-explanatory code.



\## Refactoring



Refactor when it materially improves the task at hand.



Good reasons include:



\* removing duplication introduced or exposed by the change;

\* simplifying code that blocks a clean implementation;

\* correcting an abstraction that no longer matches reality;

\* improving safety or correctness;

\* making testing substantially easier.



Do not refactor solely for stylistic preference.



\## Dependencies and architecture



\* Do not assume the current stack or architecture is permanently fixed.

\* Prefer existing project technology unless changing it has a clear material advantage.

\* Architectural changes should solve an observed constraint, not a hypothetical future one.

\* Avoid adding backend services, databases, queues, state libraries, monorepos, or other infrastructure merely for future extensibility.

\* Likewise, do not force work into the client or existing architecture when requirements clearly justify another approach.



\## Validation



Validate proportionally to the change.



\* Run the narrowest relevant checks first.

\* Run tests related to changed behavior.

\* Run type checking when TypeScript behavior or public types change.

\* Run linting/formatting for affected code when applicable.

\* Run a production build when changes can affect bundling, routing, configuration, deployment, or compilation.

\* Expand validation when focused checks reveal broader risk.

\* Do not repeatedly run expensive full-project checks after changes that cannot affect them.



Never declare a task complete while aware of a failure introduced by the change.



If an unrelated pre-existing failure blocks validation, report it clearly.



\## Testing



\* Test behavior and externally meaningful contracts rather than implementation details.

\* Add regression tests for bugs when practical.

\* Do not add tests whose only purpose is increasing coverage.

\* Prefer deterministic tests.

\* Avoid excessive mocking when a lightweight real implementation is clearer and more reliable.



\## Compatibility



\* Respect the platforms and environments the project currently supports.

\* Do not silently reduce compatibility.

\* When browser, runtime, codec, API, or platform support is uncertain, detect capabilities or verify assumptions rather than relying on guesswork.

\* Prefer graceful degradation when a feature cannot be supported everywhere.



\## Documentation



Update documentation when behavior, setup, public APIs, configuration, or important architectural assumptions change.



Do not duplicate information across documentation unnecessarily.



Keep documentation aligned with the implementation rather than describing hypothetical future behavior.



## Contribution conventions



* Name branches `postigodev/<branch-name>` for repository-owner work. Other contributors must use `<github-username>/<branch-name>` with their own GitHub username.
* Every commit message must follow `type(scope): description`.



\## Repository hygiene



\* Do not modify unrelated files.

\* Do not commit generated artifacts unless the repository intentionally tracks them.

\* Do not expose secrets, credentials, personal data, or local environment configuration.

\* Respect the repository's formatter, linter, package manager, and existing tooling.

\* Do not replace established tooling solely because another tool is preferred.



\## Completion



Before finishing:



1\. Review the diff for accidental or unrelated changes.

2\. Verify the implementation addresses the actual task.

3\. Run the appropriate level of validation.

4\. Note material tradeoffs, limitations, or follow-up work only when they genuinely matter.

Keep the final summary concise and focused on what changed and how it was validated.
