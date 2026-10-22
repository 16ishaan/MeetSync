import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from assignments import extract_assignments
from speakers import align_words
from transcription_server import app


class SpeakerTests(unittest.TestCase):
    def test_named_assignments_separate_from_speaker(self):
        actions = extract_assignments('Ishaan: hello everyone today jigisha will do the review for the product and risheek will do the backend testing')
        self.assertEqual([(a['owner'], a['task']) for a in actions], [('Jigisha','do the review for the product'), ('Risheek','do the backend testing')])
        actions = extract_assignments('Jigisha: I will review. She will share notes.\nSpeaker 1: I will test.')
        self.assertEqual([a['owner'] for a in actions], ['Jigisha', 'Not specified', 'Not specified'])

    def test_compound_assignments_and_negation(self):
        self.assertEqual(extract_assignments('Jigisha and Risheek will review.')[0]['owner'], 'Jigisha and Risheek')
        self.assertEqual(len(extract_assignments('Jigisha will review and test.')), 1)
        for text in ['Jigisha will not review.', 'If Risheek will test we can ship.', 'Will Jigisha test?']:
            self.assertEqual(extract_assignments(text), [])

    def test_alignment_handles_changes_silence_and_overlap(self):
        words = [{'start':i, 'end':i+.8, 'text':t} for i,t in enumerate(['Hello','everyone','Review','unknown','overlap'])]
        turns = [{'start':0,'end':1.9,'speaker':7}, {'start':2,'end':2.9,'speaker':8}, {'start':4,'end':5,'speaker':7}, {'start':4,'end':5,'speaker':8}]
        result = align_words(words, turns)
        self.assertEqual([s['speaker'] for s in result], ['Speaker 1','Speaker 2','Unknown speaker'])
        self.assertEqual(result[0]['text'], 'Hello everyone')
        self.assertEqual(result[-1]['text'], 'unknown overlap')

    @patch('transcription_server.speaker_status', return_value={'available':False, 'message':'Install speaker models.'})
    def test_unconfigured_model_returns_actionable_status(self, _):
        client = TestClient(app)
        self.assertFalse(client.get('/speakers/status').json()['available'])
        self.assertEqual(client.post('/transcribe/speakers', files={'file':('meeting.webm',b'audio')}).status_code, 503)

    @patch('transcription_server.speaker_status', return_value={'available':True})
    def test_upload_validation(self, _):
        client = TestClient(app)
        for filename, data in [('bad.exe', b'audio'), ('meeting.webm', b'')]:
            self.assertEqual(client.post('/transcribe/speakers', files={'file':(filename,data)}).status_code, 400)

    @patch('transcription_server.get_model', return_value=object())
    @patch('transcription_server.detect_speakers', return_value={'segments':[{'speaker':'Speaker 1','text':'Hello','start':0,'end':1}]})
    @patch('transcription_server.speaker_status', return_value={'available':True})
    def test_endpoint_cleans_temporary_audio(self, _, detect, model):
        from pathlib import Path
        result = TestClient(app).post('/transcribe/speakers', files={'file':('meeting.webm',b'audio')})
        self.assertEqual(result.status_code, 200)
        self.assertFalse(Path(detect.call_args.args[0]).exists())


if __name__ == '__main__':
    unittest.main()
