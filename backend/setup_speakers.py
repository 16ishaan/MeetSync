"""Download official sherpa-onnx speaker models. Run once, outside the web request."""
from pathlib import Path
import tarfile
from urllib.request import urlretrieve

ROOT = Path(__file__).parent / 'models'
BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    archive = ROOT / 'segmentation.tar.bz2'
    print('Downloading speaker segmentation model...', flush=True)
    urlretrieve(f'{BASE}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2', archive)
    with tarfile.open(archive) as bundle:
        bundle.extractall(ROOT, filter='data')
    archive.unlink()
    print('Downloading English speaker embedding model...', flush=True)
    urlretrieve(f'{BASE}/speaker-recongition-models/nemo_en_titanet_small.onnx', ROOT / 'nemo_en_titanet_small.onnx')
    print('Speaker models ready. Restart the backend.', flush=True)


if __name__ == '__main__':
    main()
