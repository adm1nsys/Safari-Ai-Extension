# Feedback Export — raw AI-generated source

This folder is a **snapshot of what Safari's "Describe an Extension" feedback form produces**. The numeric name (`107777970`) is the feedback draft ID that macOS assigns automatically — a random number, different for every report.

When you submit feedback on an AI-generated extension — using the **"Looks good"** / **"Not quite right"** buttons (localized; in German: *"Sieht gut aus"* / *"Nicht ganz richtig"*) — the system automatically assembles the extension's **complete source plus the original generation prompt** into a temporary draft folder so it can be attached to the report. On disk that folder lives at:

```
/Users/<YourUser>/Library/Containers/com.apple.Feedback.DraftingExtension/Data/tmp/TemporaryItems/NSIRD_DraftingExtension-macOS_XXXXXX/Drafts/FB/107777970/
```

The files here are copied straight out of that staging area. The export always contains the extension as it is at that moment — before or after hand edits. This one was made after the edits, so the code is the same as in [`BetterYouTube-1E20/`](../BetterYouTube-1E20/).

## What's inside

| File | What it is |
|------|------------|
| `manifest.json` | The generated manifest — note `browser_specific_settings.safari.prompt`, which holds the **exact natural-language prompt** the extension was generated from |
| `content.js` | The content script |
| `popup.html` / `popup.css` / `popup.js` | The popup UI |

This is a way to get a *raw* copy of an extension exactly as it is right now, prompt included, without touching Safari's container directly.

> ℹ️ This staging folder is **temporary** — macOS clears it after the report is dismissed. To keep a copy, grab the files before closing the feedback report (which is exactly what was done here).

## Related

- The **installed extension folder** is [`BetterYouTube-1E20/`](../BetterYouTube-1E20/) in the repository root.
- **`Extensions.db`** in the repository root is the SQLite registry from Safari's AI-extension store:
  ```
  /Users/<YourUser>/Library/Containers/com.apple.Safari/Data/Library/Safari/MagicExtensions/
  ```
  It shows how Safari catalogs AI-generated extensions on disk. The iCloud sync data and account fields have been removed from this copy.
  > **One test on macOS 27.2:** after the database was deleted, Safari did not rebuild it from the folders, so an extension seems to need its row in `Extensions.db`. See the root README.

See the root [`README.md`](../README.md) for the full write-up: what AI-generated extensions are, where they're stored, how to edit them, and cross-platform notes.
