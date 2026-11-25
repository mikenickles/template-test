# From Chatbots to Autonomous Agents — deck build

`contact-sheet.png` shows every slide as rendered in the final QA pass.

`ai-agents-v1.pptx` is a 10-slide, 16:9 (13.333" × 7.5") executive deck. It is fully editable: native text, shapes, a native chart on slide 6, a native table on slide 8, and speaker notes on every slide.

## Rebuild

```bash
cd presentation
npm install          # pptxgenjs, react-icons, react, react-dom, sharp
npm run build        # node build_deck.js  -> ai-agents-v1.pptx
npm run audit        # python3 audit_deck.py ai-agents-v1.pptx  (needs python-pptx, lxml, Pillow)
```

The audit measures text against the fonts LibreOffice substitutes for Calibri and Cambria (Carlito and Caladea, which have the same widths). It expects them in `/usr/share/fonts/truetype/crosextra/`; on Debian or Ubuntu, `apt install fonts-crosextra-carlito fonts-crosextra-caladea`.

## Render to images (visual QA)

```bash
soffice --headless --convert-to pdf ai-agents-v1.pptx
pdftoppm -png -r 110 ai-agents-v1.pdf slide      # slide-01.png … slide-10.png
```

## Design system

| Token | Hex | Use |
|---|---|---|
| Ink | `1D2125` | Text on light slides |
| Paper | `F7F5F0` | Background of slides 2–9 |
| Night | `15181B` | Background of slides 1 and 10 |
| Pine (accent) | `0F5F58` | Main accent: loop, icons, the complexity series |
| Vermilion (highlight) | `C4461A` | Highlight: verify step, kickers, the cost series |
| Slate | `5B6168` | Secondary text |

- **Fonts:** Cambria for headings, Calibri for body text. Both ship with Office, and LibreOffice has width-matched substitutes for them.
- **Motif:** an "orbit" of the Plan, Act and Verify loop. On slide 1 the loop is half drawn; slide 9 repeats it small; on slide 10 it is complete. The footer glyph repeats it on every content slide.
- **Shape names:** every shape's name starts with its role (`title`, `body-*`, `label-*`, `stat-*`, `deco-*`, `arrow`). `audit_deck.py` uses these names to check font sizes: titles 28–36pt, body text at least 16pt, labels at least 12pt.
