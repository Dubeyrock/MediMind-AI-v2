"""Run from the frontend folder:  python add_footer_credit.py
Updates src/App.jsx and src/style.css with the 'Developed by Shivam Dubey' footer credit."""
from pathlib import Path

def patch(path, edits, append=""):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if "landing-footer__credit" in text:
        print(f"{path}: already updated, skipping")
        return
    for old, new in edits:
        if text.count(old) != 1:
            raise SystemExit(f"{path}: expected exactly 1 match, found {text.count(old)} for:\n{old}")
        text = text.replace(old, new)
    p.write_text(text + append, encoding="utf-8")
    print(f"{path}: updated")

patch("src/App.jsx", [(
"""        <span>Made for curious minds. For educational purposes only.</span>
      </footer>""",
"""        <div className="landing-footer__info">
          <span>Made for curious minds. For educational purposes only.</span>
          <span className="landing-footer__credit">
            Developed by <strong>Shivam Dubey</strong> (AI Developer)
          </span>
        </div>
      </footer>""")])

patch("src/style.css", [
(".landing-footer > span { color: #97a29b; font-size: 9px; }",
 ".landing-footer__info { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding: 10px 0; }\n"
 ".landing-footer__info > span { color: #97a29b; font-size: 9px; }\n"
 ".landing-footer__credit strong { color: #21866f; font-weight: 600; }"),
("  .landing-footer > span { max-width: 155px; font-size: 8px; text-align: right; line-height: 1.5; }",
 "  .landing-footer__info { max-width: 175px; }\n"
 "  .landing-footer__info > span { font-size: 8px; text-align: right; line-height: 1.5; }"),
(':root[data-theme="dark"] .landing-footer > span,',
 ':root[data-theme="dark"] .landing-footer__info > span,'),
], append='\n:root[data-theme="dark"] .landing-footer__credit strong { color: #65c2a2; }\n')
