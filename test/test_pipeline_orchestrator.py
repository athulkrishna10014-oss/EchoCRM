"""
Verification tests for the Python AI pipeline orchestrator.

Tests the MANUAL CUSTOMER PATH (customer_id supplied) and NO-CUSTOMER PATH.
Runs using Python's unittest module with mocked Whisper and Ollama.

Run with: python -m pytest test/test_pipeline_orchestrator.py -v
         OR: python test/test_pipeline_orchestrator.py
"""

import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock, call

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def make_mock_transcriber(text="Hello, Rahul Mathew speaking here."):
    """Returns a mock AudioTranscriber that returns a fixed transcript."""
    mock = MagicMock()
    mock.validate_audio_file.return_value = None
    mock.transcribe.return_value = {
        "text": text,
        "duration_seconds": 60.0,
        "language": "en",
        "processing_time": 1.0,
        "segments": []
    }
    return mock


MOCK_ANALYSIS_JSON = json.dumps({
    "summary": "Sales call with customer.",
    "sentiment": "positive",
    "deal_stage": "prospecting",
    "deal_value": None,
    "customer_intent": "Interested in 2BHK apartment.",
    "products_discussed": ["2BHK Apartment"],
    "action_items": [
        {
            "title": "Schedule site visit",
            "detailed_description": "Visit the property on Saturday.",
            "priority": "high",
            "due_date": None,
            "subtasks": [],
            "key_context": {},
            "recommendation": "Confirm visit time with customer."
        }
    ],
    "follow_up": {
        "required": True,
        "date": None,
        "reason": "Customer wants to visit Saturday."
    }
})

MOCK_CUSTOMER_NAME_JSON = json.dumps({"customer_name": "Rahul Mathew"})
MOCK_NO_CUSTOMER_NAME_JSON = json.dumps({"customer_name": None})


class TestManualCustomerPath(unittest.TestCase):
    """
    MANUAL CUSTOMER PATH: customer_id is supplied.

    Requirements:
    - AI must NOT extract a customer name
    - customer matching must NOT run
    - customer creation must NOT run
    - supplied customer_id remains authoritative in the result
    - extracted_customer_name must be None
    - customer_pre_supplied must be True
    """

    def test_manual_customer_skips_name_extraction(self):
        """
        When customer_id='uuid-rahul-a' is supplied,
        the LLM must only be called ONCE (for CRM analysis, not for customer name extraction).
        """
        mock_transcriber = make_mock_transcriber()
        mock_llm = MagicMock()
        # LLM should only be called for CRM analysis — not for customer name
        mock_llm.generate.return_value = MOCK_ANALYSIS_JSON
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        result = pipeline.process_call("fake_audio.mp3", customer_id="uuid-rahul-a")

        # LLM called exactly ONCE (CRM analysis only — no customer name extraction)
        self.assertEqual(mock_llm.generate.call_count, 1,
            f"LLM was called {mock_llm.generate.call_count} times but should be called exactly 1 time (analysis only). "
            "This means customer name extraction ran when it should NOT have.")

        self.assertEqual(result["status"], "SUCCESS")
        self.assertTrue(result["customer_pre_supplied"],
            "customer_pre_supplied should be True when customer_id was given")
        self.assertIsNone(result["extracted_customer_name"],
            "extracted_customer_name must be None when customer_id was pre-supplied")

    def test_manual_customer_id_is_authoritative(self):
        """
        The returned result must reflect customer_pre_supplied=True.
        The caller (aiPipelineService) will use the supplied customer_id for all CRM records.
        """
        mock_transcriber = make_mock_transcriber()
        mock_llm = MagicMock()
        mock_llm.generate.return_value = MOCK_ANALYSIS_JSON
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        result = pipeline.process_call("fake_audio.mp3", customer_id="uuid-rahul-a")

        self.assertEqual(result["status"], "SUCCESS")
        self.assertTrue(result["customer_pre_supplied"])
        # extracted_customer_name must be None — the AI did not run customer extraction
        self.assertIsNone(result["extracted_customer_name"])
        # metadata also reflects this
        self.assertTrue(result["metadata"]["customer_pre_supplied"])

    def test_no_customer_id_triggers_name_extraction(self):
        """
        When customer_id is None, LLM must be called TWICE:
        1. Customer name extraction
        2. CRM analysis
        """
        mock_transcriber = make_mock_transcriber()
        mock_llm = MagicMock()
        # First call: name extraction → returns {"customer_name": "Rahul Mathew"}
        # Second call: CRM analysis → returns full analysis JSON
        mock_llm.generate.side_effect = [MOCK_CUSTOMER_NAME_JSON, MOCK_ANALYSIS_JSON]
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        result = pipeline.process_call("fake_audio.mp3", customer_id=None)

        # LLM must be called TWICE when no customer_id is given
        self.assertEqual(mock_llm.generate.call_count, 2,
            f"LLM was called {mock_llm.generate.call_count} times. "
            "Expected 2 calls (customer name extraction + CRM analysis) when no customer_id.")

        self.assertEqual(result["status"], "SUCCESS")
        self.assertFalse(result["customer_pre_supplied"])
        self.assertEqual(result["extracted_customer_name"], "Rahul Mathew",
            "Should return the extracted name from the first LLM call")

    def test_no_customer_id_null_name_result(self):
        """
        When LLM returns {"customer_name": null}, extracted_customer_name must be None.
        The application layer will handle this as 'no_name' → needs_customer.
        """
        mock_transcriber = make_mock_transcriber()
        mock_llm = MagicMock()
        mock_llm.generate.side_effect = [MOCK_NO_CUSTOMER_NAME_JSON, MOCK_ANALYSIS_JSON]
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        result = pipeline.process_call("fake_audio.mp3", customer_id=None)

        self.assertEqual(result["status"], "SUCCESS")
        self.assertIsNone(result["extracted_customer_name"],
            "When LLM returns null for customer_name, extracted_customer_name must be None")
        self.assertFalse(result["customer_pre_supplied"])

    def test_audio_validation_failure(self):
        """Audio error must short-circuit the pipeline before any LLM call."""
        mock_transcriber = make_mock_transcriber()
        mock_transcriber.validate_audio_file.side_effect = FileNotFoundError("Audio file not found: fake.mp3")
        mock_llm = MagicMock()
        mock_llm.generate.return_value = MOCK_ANALYSIS_JSON
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        result = pipeline.process_call("fake.mp3", customer_id="uuid-rahul-a")

        self.assertEqual(result["status"], "AUDIO_ERROR")
        # LLM must NOT be called at all
        mock_llm.generate.assert_not_called()

    def test_customer_id_none_vs_empty_string(self):
        """
        Empty string customer_id should behave as no customer (falsy).
        """
        mock_transcriber = make_mock_transcriber()
        mock_llm = MagicMock()
        mock_llm.generate.side_effect = [MOCK_CUSTOMER_NAME_JSON, MOCK_ANALYSIS_JSON]
        mock_llm.get_provider_name.return_value = "mock"
        mock_llm.get_model_name.return_value = "mock-model"

        from ai.pipeline.orchestrator import CallPipeline
        pipeline = CallPipeline(transcriber=mock_transcriber, llm_provider=mock_llm)

        # Empty string is falsy → should trigger name extraction
        result = pipeline.process_call("fake_audio.mp3", customer_id="")

        self.assertFalse(result["customer_pre_supplied"],
            "Empty string customer_id should be treated as no customer (falsy)")
        self.assertEqual(mock_llm.generate.call_count, 2,
            "Empty string customer_id should trigger name extraction (2 LLM calls)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
