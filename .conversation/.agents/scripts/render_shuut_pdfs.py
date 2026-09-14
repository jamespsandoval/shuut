import fitz, os
files={'spec':'attached_assets/SHÜÜT_v1_Build_Spec_14Sep26_(1)_1789389132571.pdf','brand':'attached_assets/SHUUT_Brand_Guide_v2_1789389235936.pdf'}
for label,path in files.items():
 doc=fitz.open(path); out=f'.agents/outputs/{label}'; os.makedirs(out,exist_ok=True)
 for i,p in enumerate(doc): p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(f'{out}/page-{i+1}.png')
 print(label,len(doc))
