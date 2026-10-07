"""Windows fallback for Sites' shell packager. Archive only the configured dist tree."""
from pathlib import Path
import json,tarfile,io
root=Path(__file__).resolve().parents[1];dist=root/'dist';output=root/'artifacts/site.tar.gz'
config=json.loads((root/'.openai/hosting.json').read_text(encoding='utf-8'))
assert config.get('static',{}).get('directory')=='dist'
assert (dist/'index.html').is_file()
for item in dist.rglob('*'):
    assert not item.is_symlink(),f'Unexpected symlink: {item}'
    assert item.resolve().is_relative_to(dist.resolve())
with tarfile.open(output,'w:gz') as archive:
    archive.add(dist,arcname='dist')
    payload=json.dumps(config).encode();info=tarfile.TarInfo('dist/.openai/hosting.json');info.size=len(payload);archive.addfile(info,io.BytesIO(payload))
with tarfile.open(output) as archive:
    names=archive.getnames();assert 'dist/index.html' in names and 'dist/.openai/hosting.json' in names
    assert all(n.startswith('dist/') or n=='dist' for n in names)
print('Validated static archive:',output.stat().st_size,'bytes',len(names),'entries')
