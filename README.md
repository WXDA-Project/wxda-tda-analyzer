# WXDA Analyser

A Next.js web app for the **Waterloo Cross-Dressing Archive (WXDA)** research project. It analyses OCR text files downloaded from the Times Digital Archive (TDA), uses the Groq API to decide whether each article is relevant to the archive, and extracts structured metadata ready for cataloguing.

## Quick start

### 1. Add your Groq API key

Copy the example env file and add your key:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

Get a free key at https://console.groq.com.

### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## How to use

1. **Set the publication date** — type the date shared by all files in the current batch (e.g. `7 Jan 1856`). This is used as a fallback when the model cannot extract a date from the article text.
2. **Select the search term** — choose the WXDA search term you used to retrieve this batch from the TDA dropdown. It is applied to all files dropped in the current session.
3. **Drop your .txt files** — drag one or more TDA OCR exports onto the upload zone (or click to browse). HTML tags (`<span class="hitHighlite">...</span>`) are stripped automatically before sending.
4. **Wait for results** — up to three files are processed concurrently. Each row shows its status (Queued → Processing → Done / Error). Click any completed row to expand the full metadata panel.
5. **Export** — use **Export CSV** to download a dated `.csv` file, or **Copy TSV** to copy tab-separated data to your clipboard for pasting into Google Sheets or Excel.

---

## Metadata fields extracted

| Field | Description |
|---|---|
| Relevant | Yes / No |
| Relevance reason | One-sentence explanation |
| Title | Article headline or Untitled |
| Date | From article text, or the batch date |
| Page / Column | e.g. 7 / B |
| Summary | 1-2 sentence WXDA-style summary |
| Attire | Controlled vocabulary value |
| Activities | Crossdressing activities (may be multiple) |
| Category | Provisional WXDA category |
| Tone | Positive / Negative / Neutral / Ambiguous / Humorous / Sensational |
| Report scope | Central / Peripheral / Anecdote |
| Gender manifestation | Recognition / Voluntary / Forced / Discovered |
| Motive | Livelihood / Love / Adventure / Female emancipation / No motive stated |
| Matched search terms | Which WXDA search terms the article actually matches |
| Notes | Anything unusual or worth flagging |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key — server-side only, never exposed to the browser |

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Groq SDK** — `llama-3.3-70b-versatile`, temperature 0.1
- No database, no authentication
