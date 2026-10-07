from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1];out=root/'GitHub-Pages-ready.zip'
skip={'node_modules','dist','.git','artifacts','__pycache__'}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in root.rglob('*'):
        relative=f.relative_to(root)
        if f.is_file() and f!=out and not any(p in skip for p in relative.parts):z.write(f,relative.as_posix())
print('GitHub Pages source package ready:',out.stat().st_size,'bytes')
