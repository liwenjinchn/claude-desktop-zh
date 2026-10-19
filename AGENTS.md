# Development entry point

Read `HANDOFF.md` before continuing development. It records the implemented
behavior, actual test coverage, and remaining work. Read
`.handoff/local-environment.md` if present for this machine's test paths.

- Use Node.js 22+ and `npm test`. The runtime has no npm dependencies.
- Keep official translation catalogs, credentials, application binaries, and
  test profiles outside Git. `.catalogs/` is local and ignored.
- Preserve application data. Default Windows plugin behavior is runtime
  localization of the original app, including MSIX. First-launch setup waits for
  normal exit, backs up developer settings and enables only allowDevTools.
  Never write that setting while any Claude process is running; retain the
  owner/configuration and file-hash checks and keep backups outside the profile.
  Resource patching remains explicit for writable non-MSIX installs, with backups.
  Never change WindowsApps permissions or silently create a copy. Test writes
  only against isolated fixtures/copies unless the user authorizes a live install.
  Copy mode remains an explicit isolated-data testing option.
- Keep the CLI as the single implementation of patching, locking and restore;
  magpie integrations call it rather than implementing a second installer.
- Treat unknown frontend anchors and file/version/hash drift as errors.
- Distinguish Windows real-app tests, magpie source-host tests, unit tests,
  and macOS plans. Do not claim untested platforms or host versions work.
- Do not stop a user's Claude tasks or change signing, OS protections, or
  default shortcuts as part of an ordinary localization test.

These instructions apply to the entire repository.
