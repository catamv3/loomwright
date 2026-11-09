# Loomwright — machine knit studio for Mac

A browser-based, Mac-friendly design studio for machine knitters, organised in the same five-step workflow as classic machine-knitting design software:

1. **Garment Styling** – set-in, drop-shoulder, raglan, cardigan or vest; crew/scoop/V/boat necklines; women's, men's and children's size tables or your own measurements; ease and ribbing.
2. **Pattern Drafting** – reshape any piece freely: drag points, double-click edges to add points, symmetry, snapping, live edge measurements, start from rectangles/circles/etc., trace a photo of a garment as a background image.
3. **Stitch Designer** – draw on a stitch grid at true tension proportions with pencil/line/rectangle/fill/eyedropper tools, any number of repeats, fabric view, colour plus tuck/slip/purl/lace (transfer and eyelet) stitches, starter patterns, and an *Arrange on garment* view to slide the pattern across each piece.
4. **Interactive Knitting** – row-by-row progress with needle positions (L/R numbering), shaping instructions, voice/beep alerts for yarn changes, shaping, markers and technique changes, a needle-bed strip for the current row, and an optional USB-serial machine link (Web Serial, Chrome/Edge). Print full instructions or export chart PNGs.
5. **Graphics Studio** – drop, paste or open any image; set stitches/rows, number of yarn colours and max colours per row; pick yarn colours from the image or choose any shade; optional dithering; send the result to Stitch Designer.

On iPhone and small screens: toolbars wrap, charts fit the screen width with − / Fit / + zoom buttons, pinch-zoom works in Pattern Drafting, and Interactive Knitting has a large Next row bar at the bottom of the screen. Add it to your Home Screen from Safari for a full-screen app.

Mac touches: ⌘1–5 switch sections (in the installed app), ⌘S / ⌘O save and open project files, ⌘Z / ⇧⌘Z undo/redo, ⌘P prints, trackpad pinch-to-zoom, light/dark mode, and it installs to the Dock from Safari (File → Add to Dock) or Chrome (Install app). Work autosaves in the browser.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # static site in dist/
```

## Deploy to Vercel

**Option A – GitHub:** push this folder to a GitHub repo, then in Vercel choose *Add New → Project → Import*. `vercel.json` already sets the build command (`npm run build`) and output folder (`dist`).

**Option B – CLI:**

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production
```

No server or environment variables are needed — it's a fully static app.
