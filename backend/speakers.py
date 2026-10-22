"""CPU-only speaker diarization, followed by word timestamp alignment.

Models run locally. No speaker identities or enrolled voiceprints are stored.
"""
import importlib.util
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock

MODEL_DIR = Path(__file__).parent / 'models'
SEGMENTATION = Path(os.getenv('SPEAKER_SEGMENTATION_MODEL', str(MODEL_DIR / 'sherpa-onnx-pyannote-segmentation-3-0' / 'model.onnx')))
EMBEDDING = Path(os.getenv('SPEAKER_EMBEDDING_MODEL', str(MODEL_DIR / 'nemo_en_titanet_small.onnx')))
INFERENCE_LOCK = Lock()
MAX_SECONDS = 15 * 60


def speaker_status():
    ready = bool(importlib.util.find_spec('sherpa_onnx')) and SEGMENTATION.is_file() and EMBEDDING.is_file()
    return {'available': ready, 'message': 'Local speaker detection ready.' if ready else 'Speaker models are not installed. See README: Speaker detection setup.'}


def diarization_config(num_speakers=-1):
    if not speaker_status()['available']:
        raise RuntimeError(speaker_status()['message'])
    import sherpa_onnx as so
    config = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(
            pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(SEGMENTATION)), num_threads=2),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=str(EMBEDDING), num_threads=2),
        clustering=so.FastClusteringConfig(num_clusters=num_speakers, threshold=.75),
        min_duration_on=.3, min_duration_off=.5,
    )
    if not config.validate():
        raise RuntimeError('Speaker model configuration is invalid. Run the speaker setup again.')
    return config


@lru_cache(maxsize=1)
def get_diarizer():
    import sherpa_onnx as so
    return so.OfflineSpeakerDiarization(diarization_config())


def align_words(words, turns):
    """Assign by maximum time overlap, retaining uncertain and overlapping words."""
    output = []
    labels = {}
    for word in words:
        text = word['text'].strip()
        if not text:
            continue
        overlaps = {}
        for turn in turns:
            overlap = max(0, min(word['end'], turn['end']) - max(word['start'], turn['start']))
            if overlap:
                overlaps[turn['speaker']] = overlaps.get(turn['speaker'], 0) + overlap
        ranked = sorted(overlaps, key=overlaps.get, reverse=True)
        uncertain = not ranked or (len(ranked) > 1 and overlaps[ranked[1]] >= overlaps[ranked[0]] * .8)
        if uncertain:
            speaker = 'Unknown speaker'
        else:
            raw = ranked[0]
            if raw not in labels:
                labels[raw] = f'Speaker {len(labels) + 1}'
            speaker = labels[raw]
        if output and output[-1]['speaker'] == speaker and word['start'] - output[-1]['end'] < 1.5:
            output[-1]['text'] += ' ' + text
            output[-1]['end'] = round(word['end'], 2)
        else:
            output.append({'speaker': speaker, 'text': text, 'start': round(word['start'], 2), 'end': round(word['end'], 2)})
    return output


def detect_speakers(path, whisper_model, num_speakers=-1):
    audio = decode_limited_audio(path)
    if len(audio) < 16000:
        raise ValueError('Record at least one second of speech.')
    with INFERENCE_LOCK:
        diarizer = get_diarizer()
        diarizer.set_config(diarization_config(num_speakers))
        turns = [{'start': t.start, 'end': t.end, 'speaker': t.speaker} for t in diarizer.process(audio).sort_by_start_time()]
        segments, info = whisper_model.transcribe(audio, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
        words = [{'start': w.start, 'end': w.end, 'text': w.word} for segment in segments for w in (segment.words or [])]
    labelled = align_words(words, turns)
    return {'segments': labelled, 'language': info.language,
            'text': '\n'.join(f"{s['speaker']}: {s['text']}" for s in labelled),
            'notice': 'Voice groups are estimates. Name speakers after reviewing the audio; names are never inferred from people mentioned.'}


def decode_limited_audio(path):
    """Decode to mono float32 at 16 kHz, enforcing duration even without metadata."""
    import av
    import numpy as np
    chunks, count = [], 0
    resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
    def append(frames):
        nonlocal count
        for frame in frames:
            chunk = frame.to_ndarray().reshape(-1)
            count += len(chunk)
            if count > MAX_SECONDS * 16000:
                raise ValueError('Speaker recordings are limited to 15 minutes. Use a shorter recording.')
            chunks.append(chunk)
    with av.open(path) as container:
        seconds = container.duration / av.time_base if container.duration else None
        if seconds and seconds > MAX_SECONDS:
            raise ValueError('Speaker recordings are limited to 15 minutes. Use a shorter recording.')
        for frame in container.decode(audio=0):
            frame.pts = None
            append(resampler.resample(frame))
        append(resampler.resample(None))
    return np.concatenate(chunks) if chunks else np.empty(0, dtype=np.float32)
