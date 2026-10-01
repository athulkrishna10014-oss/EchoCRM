"""
Unit Tests for Python Module Caching and Whisper Model Instance Reuse (FIX 3)

Requirements verified:
- Python modules remain cached normally in sys.modules.
- Whisper model instances are cached and reusable across requests.
- AudioTranscriber.get_model() does NOT re-initialize a new model instance on repeated calls.
- Calling /process-call or the pipeline preserves singletons in memory.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Add project root to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

class TestModuleCachingAndWhisperReuse(unittest.TestCase):
    def test_sys_modules_retains_ai_packages(self):
        """Verify ai modules stay in sys.modules and are not purged."""
        import ai.server
        import ai.pipeline.orchestrator
        import ai.transcription.transcriber
        import ai.analysis.validator

        self.assertIn("ai.server", sys.modules)
        self.assertIn("ai.transcription.transcriber", sys.modules)
        self.assertIn("ai.pipeline.orchestrator", sys.modules)

    def test_whisper_model_instance_is_reused(self):
        """Verify AudioTranscriber caches its model instance across multiple get_model calls."""
        from ai.transcription.transcriber import AudioTranscriber

        # Mock the faster_whisper WhisperModel to test caching logic without downloading weights
        mock_whisper_instance = MagicMock()
        mock_whisper_instance.name = "cached_whisper_instance_test"

        with patch("faster_whisper.WhisperModel", return_value=mock_whisper_instance):
            # Reset instance for clean test
            AudioTranscriber._model_instance = None
            AudioTranscriber._model_name = None

            # First retrieval
            model_1 = AudioTranscriber.get_model()
            # Second retrieval
            model_2 = AudioTranscriber.get_model()

            # Verify identical instance returned
            self.assertIs(model_1, model_2, "Expected identical cached Whisper model instance")
            self.assertIs(model_1, mock_whisper_instance)
            self.assertEqual(model_1.name, "cached_whisper_instance_test")

    def test_process_call_preserves_module_cache(self):
        """Verify handle_process_call in ai/server.py does not delete sys.modules."""
        import ai.server as server
        from ai.server import ProcessCallRequest

        # Check module is present before
        self.assertIn("ai.pipeline.orchestrator", sys.modules)

        with patch("ai.server.process_call") as mock_pipeline:
            mock_pipeline.return_value = {
                "status": "SUCCESS",
                "transcript": "Hello world",
                "analysis": {},
                "metadata": {"audio_duration_seconds": 5}
            }

            with patch("os.path.exists", return_value=True):
                req = ProcessCallRequest(audio_path="fake/path.mp3")
                res = server.handle_process_call(req)

                # Verify result
                self.assertEqual(res["status"], "SUCCESS")

                # Verify modules were NOT purged from sys.modules
                self.assertIn("ai.pipeline.orchestrator", sys.modules)
                self.assertIn("ai.transcription.transcriber", sys.modules)
                self.assertIn("ai.server", sys.modules)

if __name__ == "__main__":
    unittest.main()
