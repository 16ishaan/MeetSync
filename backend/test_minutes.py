import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from transcription_server import app
from minutes import MinutesRequest, generate_minutes


class MinutesTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.request = {"title": "Release & review <Oct>", "date": "2026-10-17", "attendees": "Ishaan, Siddhant", "transcript": "The team agreed to ship PDF export. Ishaan will test the recorder before Friday. We discussed the release timeline. The next meeting is Monday."}

    @patch.dict(os.environ, {"OLLAMA_MODEL": ""})
    def test_generate_grounded_draft_and_pdf(self):
        response = self.client.post('/minutes', json=self.request)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['method'], 'extractive')
        self.assertIn('agreed', result['decisions'][0])
        self.assertEqual(result['actions'][0]['owner'], 'Not specified')
        self.assertEqual(result['actions'][0]['due'], 'Not specified')
        self.assertEqual(result['date'], self.request['date'])
        result['actions'][0]['owner'] = 'Ishaan'
        result['actions'][0]['due'] = 'Friday'
        pdf = self.client.post('/minutes/pdf', json=result)
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.headers['content-type'], 'application/pdf')
        self.assertTrue(pdf.content.startswith(b'%PDF'))

    @patch.dict(os.environ, {"OLLAMA_MODEL": ""})
    def test_no_fabricated_commitments(self):
        result = self.client.post('/minutes', json={"transcript": "We discussed several product ideas. The team reviewed the current dashboard."}).json()
        self.assertEqual(result['decisions'], [])
        self.assertEqual(result['actions'], [])

    @patch.dict(os.environ, {"OLLAMA_MODEL": ""})
    def test_maximum_unpunctuated_transcript(self):
        result = self.client.post("/minutes", json={"transcript": "x" * 60000})
        self.assertEqual(result.status_code, 200)
        self.assertLessEqual(len(result.json()["summary"]), 12000)

    def test_local_development_cors(self):
        for origin in ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:3000"]:
            response = self.client.options("/minutes", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["access-control-allow-origin"], origin)
        response = self.client.options("/minutes", headers={"Origin": "https://localhost.evil.example", "Access-Control-Request-Method": "POST"})
        self.assertEqual(response.status_code, 400)

    def test_invalid_input(self):
        for transcript in ['', 'hello', ' '*30, 'x'*60001]:
            self.assertEqual(self.client.post('/minutes', json={'transcript': transcript}).status_code, 422)
        self.assertEqual(self.client.post('/transcribe', files={'file': ('bad.exe', b'audio')}).status_code, 400)

    @patch.dict(os.environ, {"OLLAMA_MODEL": "local-model"})
    @patch('minutes.urlopen', side_effect=OSError('offline'))
    def test_model_failure_has_explicit_fallback(self, _):
        result = generate_minutes(MinutesRequest(**self.request))
        self.assertEqual(result.method, 'extractive')
        self.assertIn('unavailable', result.notice)

    @patch.dict(os.environ, {"OLLAMA_MODEL": "local-model"})
    @patch('minutes.urlopen')
    def test_ai_response_validated_and_metadata_preserved(self, mock):
        from io import BytesIO
        mock.return_value.__enter__.return_value = BytesIO(json.dumps({'response': json.dumps({'title': 'Invented', 'date': '2000-01-01', 'summary': 'The team approved PDF export.', 'actions': []})}).encode())
        result = generate_minutes(MinutesRequest(**self.request))
        self.assertEqual(result.method, 'local-ai')
        self.assertEqual(result.title, self.request['title'])
        self.assertEqual(result.date, self.request['date'])

    def test_unsupported_font_characters_fail_clearly(self):
        response = self.client.post('/minutes/pdf', json={'title': 'Meeting', 'summary': '中文'})
        self.assertEqual(response.status_code, 422)
        self.assertIn('font', response.json()['detail'])


if __name__ == '__main__':
    unittest.main()
