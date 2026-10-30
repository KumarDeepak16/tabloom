# Contributing to Tabloom

Bug reports and small pull requests are welcome.

## Set up

1. Clone the repo.
2. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the repo folder.
3. After a change, press reload on Tabloom's card, then open a new tab.

There is no build step and no runtime dependency. The extension is plain HTML, CSS and JavaScript modules.

## Before you open a pull request

- Run the tests: `node --test tests/lib.test.mjs`. Node 22 or newer is fine.
- Add a test when you change parsing, dates, URLs or backups. These live in `src/lib.js`, `src/markdown.js` and `src/ics.js`, which stay free of browser APIs for this reason.
- Try it at 1366 × 625. Small laptops come first.
- Follow [DESIGN.md](DESIGN.md): one button, `rem` for sizes, tokens for colors.
- Don't add a dependency for something a few lines can do.

## Make a release

1. Raise `version` in `manifest.json` and commit.
2. Build the zip. Files marked `export-ignore` in `.gitattributes` stay out of it:

   ```sh
   git archive --format=zip --prefix=tabloom/ -o tabloom.zip HEAD
   ```

3. Attach the zip to a GitHub release.
