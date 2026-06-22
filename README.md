# WXDA Analyser

A Next.js web app for the **Waterloo Cross-Dressing Archive (WXDA)** research project. It analyses OCR text files downloaded from the Times Digital Archive (TDA), uses the Mistral API to decide whether each article is relevant to the archive, and extracts structured metadata ready for cataloguing.

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## How to use

1. **Enter your Mistral API key** — paste your key into the API key field. It is stored in `sessionStorage` for the duration of your browser session and never sent anywhere except the Mistral API.
2. **Set the publication date** — type the date shared by all files in the current batch (e.g. `7 Jan 1856`). Used as context for the model.
3. **Select the search term** — choose the WXDA search term you used to retrieve this batch from the TDA dropdown. Applied to all files dropped in the current session.
4. **Drop your .txt files** — drag one or more TDA OCR exports onto the upload zone (or click to browse). HTML tags (`<span class="hitHighlite">...</span>`) are stripped automatically before sending, and the TDA disclaimer paragraph is removed.
5. **Wait for results** — files are processed one at a time. Each row shows its status (Queued → Processing → Done / Error / Rate limited). Rate-limited files can be retried individually.
6. **Export** — use **Export CSV** to download a dated `.csv` file, or **Copy TSV** to copy tab-separated data to your clipboard for pasting into Google Sheets or Excel. Tick **Export Yes only** to restrict the export to relevant articles.

---

## Output fields

| Column | Description |
|---|---|
| Relevant | Yes / No |
| Title | Article headline, OCR-corrected |
| Topic | Brief description of the cross-dressing case, with a direct quote where possible |
| First Words | First sentence that states the cross-dressing instance |
| First Words of Document | Opening 15 words of the article (from raw OCR, before any processing) |
| Name of Individual | Primary person involved, if clearly stated |
| Search Term | The WXDA search term selected when the file was dropped |

---

## API key

Get a Mistral API key at https://console.mistral.ai. Paste it into the **Mistral API Key** field in the app. It is kept only in `sessionStorage` — it is not written to disk and is cleared when the tab is closed.

---

## Tech stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS v4**
- **Mistral SDK**
