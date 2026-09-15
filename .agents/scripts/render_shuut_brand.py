import fitz
from pathlib import Path
src = Path('attached_assets/SHUUT_Brand_Guide_v2_1789481444329.pdf')
out = Path('.agents/outputs/shuut-brand')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(src)
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pix.save(out / f'page-{index + 1}.png')
print(f'rendered {doc.page_count} pages')
for i, page in enumerate(doc):
    print(f'--- PAGE {i+1} ---')
    print(page.get_text()[:2200])
