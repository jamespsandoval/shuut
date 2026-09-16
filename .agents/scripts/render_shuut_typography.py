import fitz
from pathlib import Path
pdf = fitz.open("attached_assets/SHUUT_Brand_Guide_v2_1789481444329.pdf")
out = Path(".agents/outputs/shuut-brand-typography.png")
out.parent.mkdir(parents=True, exist_ok=True)
pdf[4].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(out)
print(out)
