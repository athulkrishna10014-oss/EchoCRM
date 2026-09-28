import os
import json
import time
import traceback
from typing import Dict, Any, Optional

from ai.config.settings import settings
from ai.transcription.transcriber import AudioTranscriber
from ai.analysis.llm_provider import get_llm_provider, LLMProvider
from ai.analysis.prompts import SYSTEM_PROMPT, build_analysis_prompt
from ai.analysis.transcript_cleaner import clean_transcript
from ai.analysis.validator import JSONValidator
from ai.analysis.customer_name_extractor import (
    CUSTOMER_INFO_SYSTEM_PROMPT,
    build_customer_info_prompt,
    CUSTOMER_NAME_SYSTEM_PROMPT,
    build_customer_name_prompt
)


class CallPipeline:
    """
    Complete audio processing pipeline for EchoCRM AI:
    Audio -> Speech-to-Text -> Local LLM -> Structured JSON

    Customer handling:
    - If customer_id is supplied (MANUAL PATH A): customer identification is SKIPPED entirely.
      The supplied customer_id is authoritative. Exactly 1 LLM call is executed.
    - If customer_id is NOT supplied (TEMPORARY PATH B): AI extracts candidate customer
      information (name, phone, email, company) from the transcript. The application
      layer uses deterministic matching to update the temporary customer or link to an
      existing record. Ollama NEVER assigns a customer_id directly.
    """

    def __init__(
        self,
        transcriber: Optional[AudioTranscriber] = None,
        llm_provider: Optional[LLMProvider] = None
    ):
        self.transcriber = transcriber or AudioTranscriber()
        self.llm_provider = llm_provider or get_llm_provider()

    def process_call(
        self,
        audio_path: str,
        customer_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process an audio file through the full pipeline.

        Args:
            audio_path: Local filesystem path to the audio file.
            customer_id: Pre-supplied customer UUID from the CRM.
                         If provided, customer identity extraction is SKIPPED.
                         If None, AI attempts to extract customer information from transcript.

        Returns:
            dict with keys:
                status, audio_path, transcript, clean_transcript, analysis, metadata,
                extracted_customer_name, extracted_customer_info, customer_pre_supplied
        """
        start_total_time = time.time()
        errors = []
        customer_pre_supplied = bool(customer_id)

        # Result structure
        result: Dict[str, Any] = {
            "status": "PIPELINE_ERROR",
            "audio_path": audio_path,
            "transcript": "",
            "clean_transcript": "",
            "analysis": {},
            "extracted_customer_name": None,
            "extracted_customer_info": None,
            "customer_pre_supplied": customer_pre_supplied,
            "metadata": {
                "processing_time_seconds": 0.0,
                "audio_duration_seconds": 0.0,
                "transcription_model": settings.WHISPER_MODEL_SIZE,
                "llm_provider": self.llm_provider.get_provider_name(),
                "llm_model": self.llm_provider.get_model_name(),
                "errors": errors,
                "customer_pre_supplied": customer_pre_supplied,
            }
        }

        # Step 1: Validate Audio File
        try:
            self.transcriber.validate_audio_file(audio_path)
        except Exception as e:
            err_msg = f"AUDIO_ERROR: {str(e)}"
            errors.append(err_msg)
            result["status"] = "AUDIO_ERROR"
            result["metadata"]["errors"] = errors
            result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
            return result

        # Step 2: Transcribe Audio
        try:
            transcription_result = self.transcriber.transcribe(audio_path)
            transcript_text = transcription_result.get("text", "")
            audio_duration = transcription_result.get("duration_seconds", 0.0)

            result["transcript"] = transcript_text
            result["metadata"]["audio_duration_seconds"] = audio_duration

            if not transcript_text.strip():
                err_msg = "TRANSCRIPTION_ERROR: Generated transcript is empty"
                errors.append(err_msg)
                result["status"] = "TRANSCRIPTION_ERROR"
                result["metadata"]["errors"] = errors
                result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
                return result

        except Exception as e:
            err_msg = f"TRANSCRIPTION_ERROR: {str(e)}"
            errors.append(err_msg)
            result["status"] = "TRANSCRIPTION_ERROR"
            result["metadata"]["errors"] = errors
            result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
            return result

        # Step 3: Clean Transcript for LLM Consumption
        try:
            cleaned_transcript = clean_transcript(transcript_text)
            result["clean_transcript"] = cleaned_transcript
        except Exception as e:
            errors.append(f"TRANSCRIPT_CLEAN_WARNING: {str(e)}")
            cleaned_transcript = transcript_text
            result["clean_transcript"] = cleaned_transcript

        # Step 4: (Optional) Extract Customer Information from Transcript
        # ONLY executed when no customer_id was pre-supplied (Path B).
        # When customer_id is supplied (Path A), this step is COMPLETELY SKIPPED.
        # RULE: Ollama extracts candidate attributes only. It does NOT decide customer_id.
        if not customer_pre_supplied:
            try:
                info_prompt = build_customer_info_prompt(cleaned_transcript)
                raw_info_response = self.llm_provider.generate(
                    info_prompt,
                    system_prompt=CUSTOMER_INFO_SYSTEM_PROMPT
                )
                import ai.analysis.validator as validator
                extracted = validator.JSONValidator.extract_json_string(raw_info_response)
                try:
                    info_data = json.loads(extracted)
                    cleaned_info: Dict[str, Optional[str]] = {}
                    for field in ("name", "phone", "email", "company"):
                        val = info_data.get(field)
                        if val and str(val).strip().lower() not in ("null", "none", "n/a", "undefined", ""):
                            cleaned_info[field] = str(val).strip()
                        else:
                            cleaned_info[field] = None

                    # If customer_name was returned instead of name, support it
                    if not cleaned_info.get("name") and info_data.get("customer_name"):
                        cn = info_data.get("customer_name")
                        if cn and str(cn).strip().lower() not in ("null", "none", "n/a", "undefined", ""):
                            cleaned_info["name"] = str(cn).strip()

                    result["extracted_customer_info"] = cleaned_info
                    result["extracted_customer_name"] = cleaned_info.get("name")
                except (json.JSONDecodeError, ValueError):
                    result["extracted_customer_info"] = None
                    result["extracted_customer_name"] = None
                    errors.append("CUSTOMER_INFO_PARSE_WARNING: Could not parse customer info from LLM response")
            except Exception as e:
                result["extracted_customer_info"] = None
                result["extracted_customer_name"] = None
                errors.append(f"CUSTOMER_INFO_WARNING: {str(e)}")

        # Step 5: Analyze Transcript via Local LLM (CRM analysis)
        raw_llm_response = ""
        try:
            import ai.analysis.prompts as prompts
            prompt = prompts.build_analysis_prompt(cleaned_transcript)
            raw_llm_response = self.llm_provider.generate(prompt, system_prompt=prompts.SYSTEM_PROMPT)
        except Exception as e:
            err_msg = f"LLM_ERROR: {str(e)}"
            errors.append(err_msg)
            result["status"] = "LLM_ERROR"
            result["metadata"]["errors"] = errors
            result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
            return result

        # Step 6: Validate Structured Output
        import ai.analysis.validator as validator
        is_valid, validated_analysis, val_error = validator.JSONValidator.validate_llm_response(raw_llm_response)

        if not is_valid:
            err_msg = f"INVALID_LLM_OUTPUT: {val_error}. Raw LLM Response: {raw_llm_response}"
            errors.append(err_msg)
            result["status"] = "INVALID_LLM_OUTPUT"
            result["metadata"]["errors"] = errors
            result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
            return result

        # Log production task generation
        for idx, item in enumerate(validated_analysis.get("action_items", [])):
            print(f"\n[PRODUCTION TASK GENERATION - Task {idx+1}]")
            print(f"title = {item.get('title')}")
            print(f"detailed_description = {item.get('detailed_description')}")
            print(f"description = {item.get('description')}")
            print(f"due_date = {item.get('due_date')}")

        # Success!
        result["status"] = "SUCCESS"
        result["analysis"] = validated_analysis
        result["metadata"]["processing_time_seconds"] = round(time.time() - start_total_time, 3)
        result["metadata"]["errors"] = errors

        return result


def process_call(audio_path: str, customer_id: Optional[str] = None) -> Dict[str, Any]:
    pipeline = CallPipeline()
    return pipeline.process_call(audio_path, customer_id=customer_id)
