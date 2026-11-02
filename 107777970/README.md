# Feedback Export — raw AI-generated source

This folder is a **snapshot of what Safari's "Describe an Extension" feedback form produces**. The numeric name (`107777970`) is the feedback draft ID that macOS assigns automatically.

When you submit feedback on an AI-generated extension — using the **"Looks good"** / **"Not quite right"** buttons (localized; in German: *"Sieht gut aus"* / *"Nicht ganz richtig"*) — the system automatically assembles the extension's **complete source plus the original generation prompt** into a temporary draft folder so it can be attached to the report. On disk that folder lives at:

```
/Users/<YourUser>/Library/Containers/com.apple.Feedback.DraftingExtension/Data/tmp/TemporaryItems/NSIRD_DraftingExtension-macOS_XXXXXX/Drafts/FB/107777970/
```

The files here are copied straight out of that staging area, **before any hand-editing** — so this is the AI output as generated, with one exception: a "Premium" switch that hid YouTube ads has been removed before publishing.

## What's inside

| File | What it is |
|------|------------|
| `manifest.json` | The generated manifest — note `browser_specific_settings.safari.prompt`, which holds the **exact natural-language prompt** the extension was generated from |
| `content.js` | The generated content script |
| `popup.html` / `popup.css` / `popup.js` | The generated popup UI |

This is a great way to see the *raw* output of the on-device model, prompt included, without touching Safari's container directly.

> ℹ️ This staging folder is **temporary** — macOS clears it after the report is dismissed. To keep a copy, grab the files before closing the feedback report (which is exactly what was done here).

## Related

- The **edited, working extension** is in the repository root (this folder is the *before*; the root is the *after*).
- **`Extensions.db`** in the repository root is the SQLite registry from Safari's AI-extension store:
  ```
  /Users/<YourUser>/Library/Containers/com.apple.Safari/Data/Library/Safari/MagicExtensions/
  ```
  It shows how Safari catalogs AI-generated extensions on disk. The iCloud sync data and account fields have been removed from this copy.
  > **Theory (unconfirmed):** Safari *may* update this database on its own after an extension folder is added to `MagicExtensions/`, so editing `Extensions.db` by hand might not be necessary. This hasn't been verified — treat it as a guess, not a fact.

See the root [`README.md`](../README.md) for the full write-up: what AI-generated extensions are, where they're stored, how to edit them, and cross-platform notes.
