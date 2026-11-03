# Contributing to KitForge

Thanks for wanting to improve KitForge. This document summarizes how to set up
the environment, what code style the project follows and how to submit changes.

## Requirements

- Node.js 20 or higher and npm.
- Windows x64 to test packaging and installers. The core and the unit tests work
  on any system.
- FL Studio is optional: it is only needed to see the real icon preview with the
  `ILGlyphsEx` font.

## Development environment

```powershell
git clone <repository-URL>
cd kitforge
npm install
npm start
```

## Tests

Before opening a pull request, run:

```powershell
npm test        # unit tests for the core and the catalog
npm run smoke   # loads the app and checks DOM, preload and CSP
npm run e2e     # full flow on a temporary kit
```

If you touch packaging:

```powershell
npm run pack    # dist/win-unpacked/
npm run dist    # NSIS installer + portable
```

## Code style

- CommonJS in `src/main` and `src/preload`; classic JavaScript in `src/renderer`.
- No bundler and no frameworks: small, auditable code is preferred.
- Two spaces, semicolons and double quotes, like the rest of the project.
- The core (`src/core`) must not import Electron so it can be tested with
  `node --test`.
- New IPC handlers must validate the origin with `guard()` and check that paths
  are inside the open kit.



## Pull requests

1. Open a descriptive branch (`fix/folder-order`, `feat/create-folders`…).
2. Include tests for behavior changes.
3. Update the README if the interface, commands or packaging change.
4. Describe what problem it solves and how you tested it.

For bugs, include the Windows version, whether you use the installer or the
portable build, the steps to reproduce it and the error message.

## License

By contributing you agree that your contribution will be published under the
project's MIT license. See [LICENSE](LICENSE).
