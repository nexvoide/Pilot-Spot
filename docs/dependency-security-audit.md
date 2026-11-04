# Dependency security review

The npm audit on 2026-11-04 reports 25 affected package entries: two critical, 21 moderate and two low. `npm audit --omit=dev` reports zero findings. The development dependencies are not shipped as Node runtime dependencies, but development, build, CI and test environments must still treat untrusted inputs and repositories cautiously.

Direct development packages reported by npm: `vitest`, `eslint`, `eslint-config-prettier`, `eslint-plugin-react-refresh`, `typescript-eslint`, and `vite-plugin-pwa`. Transitive entries: `@eslint-community/eslint-utils`, `@eslint/config-array`, `@eslint/eslintrc`, `@rollup/plugin-node-resolve`, `@trickfilm400/rollup-plugin-off-main-thread`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, `@vitest/mocker`, `deepmerge`, `ejs`, `filelist`, `glob`, `jake`, `minimatch`, `tinypool`, and `workbox-build`. These entries include propagation through dependency chains and are not 25 independent vulnerabilities.

| Root advisory               | Installed version       | Reported vulnerable range      | Fixed version / status                                                                     |
| --------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `tinypool`                  | 1.1.1                   | <2.1.2                         | 2.1.2 or later; npm recommends Vitest 5.1.0, a major upgrade.                              |
| `vitest` / `@vitest/mocker` | 3.2.7                   | Vitest <4.1.11; mocker <4.1.12 | Vitest/mocker 4.1.12 or later for the reported mocker issues; npm recommends Vitest 5.1.0. |
| `minimatch`                 | 3.1.5, 5.1.9 and 10.2.6 | <11.0.1                        | 11.0.1 or later, outside the installed dependency ranges.                                  |
| `glob`                      | 11.1.0                  | 9.0.0–14.0.1                   | 14.0.2 or later, outside the installed dependency range.                                   |
| `deepmerge`                 | 4.3.1                   | 4.2.0–4.3.1                    | No patched version in the current published 4.x release reported by npm.                   |

The critical `tinypool` advisories concern prototype-pollution gadgets in worker options. This project uses Vitest locally and in CI; no production API accepts worker options. The `vitest`/mocker advisory concerns redirect mocks. The remaining findings affect lint/build/development dependencies. This assessment is based on the current project usage, not a guarantee that development tooling is safe for hostile inputs.

`npm audit fix --dry-run` did not propose a non-breaking change that clears the findings. No forced upgrades were applied. Review major Vitest and related tooling upgrades together, run the complete suite, and re-audit. Review `vite-plugin-pwa`/Workbox and ESLint dependency compatibility separately; npm's proposed major-version changes should not be applied blindly. Re-run the audit before release because advisory and package versions change.
