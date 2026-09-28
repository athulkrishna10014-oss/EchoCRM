import json
import re
import datetime
from typing import Dict, Any, Tuple, Optional, List
from ai.config.settings import settings


def _resolve_and_sanitize_date(date_input: Any) -> Optional[str]:
    """
    Resolves a date string into a sanitized YYYY-MM-DD date.
    Handles ISO dates (YYYY-MM-DD), relative keywords ('tomorrow', 'today', 'saturday', 'next tuesday').
    Rejects hallucinated past dates.
    """
    if not date_input:
        return None
        
    date_str = str(date_input).strip()
    if not date_str or date_str.lower() in ("null", "none", "n/a", "undefined"):
        return None

    today = datetime.date.today()

    # 1. Try parsing direct ISO format YYYY-MM-DD
    try:
        parsed = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        # Allow today and future dates (or within current day)
        if parsed >= today:
            return parsed.strftime("%Y-%m-%d")
        # Past date — check if it was just yesterday or an old hallucinated year (e.g. 2023)
        return None
    except (ValueError, TypeError):
        pass

    # 2. Try parsing relative keywords
    lower_str = date_str.lower()
    if "today" in lower_str:
        return today.strftime("%Y-%m-%d")
    if "tomorrow" in lower_str:
        return (today + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    # Weekday mapping
    weekdays = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6
    }
    for day_name, day_num in weekdays.items():
        if day_name in lower_str:
            current_day_num = today.weekday()
            days_ahead = (day_num - current_day_num) % 7
            if "next" in lower_str and days_ahead == 0:
                days_ahead = 7
            target_date = today + datetime.timedelta(days=days_ahead)
            return target_date.strftime("%Y-%m-%d")

    return None


def _format_details_to_text(val: Any, indent_level: int = 0) -> str:
    """
    Recursively converts arbitrary structured LLM output (dict, list, string)
    into clean, readable markdown-formatted task details.
    """
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, (int, float, bool)):
        return str(val)
    if isinstance(val, list):
        items = [_format_details_to_text(item, indent_level + 1) for item in val if item is not None]
        items = [it for it in items if it]
        prefix = "  " * indent_level
        return "\n".join([f"{prefix}• {item}" for item in items])
    if isinstance(val, dict):
        lines = []
        prefix = "  " * indent_level
        for k, v in val.items():
            k_title = str(k).replace("_", " ").title()
            if isinstance(v, (dict, list)):
                formatted_child = _format_details_to_text(v, indent_level + 1)
                lines.append(f"{prefix}{k_title}:\n{formatted_child}")
            else:
                v_str = str(v).strip()
                if v_str:
                    lines.append(f"{prefix}{k_title}: {v_str}")
        return "\n".join(lines)
    return str(val).strip()


def _format_product(p: Any) -> str:
    if isinstance(p, dict):
        if p.get("description"):
            return str(p["description"]).strip()
        if p.get("name") and not any(k in p for k in ("location", "size", "price", "specs", "tier")):
            return str(p["name"]).strip()

        title = p.get("name") or p.get("product") or p.get("property_type") or p.get("title") or "Item"
        loc = p.get("location") or p.get("city") or ""
        if loc:
            title += f" in {loc}"
            
        specs = []
        for key in ("size", "area", "floor", "price", "cost", "tier", "users", "plan"):
            if p.get(key):
                specs.append(str(p[key]))
                
        res = str(title)
        if specs:
            res += f" ({', '.join(specs)})"
            
        amenities = p.get("amenities") or p.get("features")
        if amenities:
            if isinstance(amenities, list):
                res += f" — Features: {', '.join(str(a) for a in amenities)}"
            else:
                res += f" — Features: {amenities}"
        return res.strip()
    return str(p).strip()


def _extract_deal_value(data: Dict[str, Any]) -> Optional[float]:
    val = data.get("deal_value")
    if isinstance(val, (int, float)) and val > 0:
        return float(val)
    
    text_to_search = str(data.get("products_discussed", [])) + " " + str(data.get("summary", "")) + " " + str(data.get("action_items", []))
    
    # Check for Lakhs
    match_lakh = re.search(r'(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|l)\b', text_to_search, re.IGNORECASE)
    if match_lakh:
        return float(match_lakh.group(1)) * 100000

    # Check for Crores
    match_cr = re.search(r'(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:crore|crores|cr)\b', text_to_search, re.IGNORECASE)
    if match_cr:
        return float(match_cr.group(1)) * 10000000

    # Check for direct dollar/rupee amounts (e.g. $50,000 or ₹6800000)
    match_num = re.search(r'(?:[$₹]|rs\.?)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{5,}(?:\.\d+)?)', text_to_search, re.IGNORECASE)
    if match_num:
        clean_num = match_num.group(1).replace(",", "")
        try:
            return float(clean_num)
        except ValueError:
            pass

    return None


def _clean_subtasks(raw_subtasks: Any) -> List[str]:
    if not raw_subtasks:
        return []
    result = []
    if isinstance(raw_subtasks, list):
        for s in raw_subtasks:
            if isinstance(s, dict):
                title = s.get("title") or s.get("action") or s.get("description") or ""
                if title and str(title).strip():
                    result.append(str(title).strip().lstrip("•-*[]0123456789. "))
            elif isinstance(s, str) and s.strip():
                clean_s = s.strip().lstrip("•-*[]0123456789. ")
                if clean_s:
                    result.append(clean_s)
    elif isinstance(raw_subtasks, str) and raw_subtasks.strip():
        lines = [line.strip().lstrip("•-*[]0123456789. ") for line in raw_subtasks.split("\n") if line.strip()]
        result.extend([l for l in lines if l])
    return result


def _clean_key_context(raw_context: Any) -> Dict[str, str]:
    if not raw_context or not isinstance(raw_context, dict):
        return {}
    clean_dict = {}
    for k, v in raw_context.items():
        if v is not None:
            formatted_val = _format_details_to_text(v).strip()
            if formatted_val and formatted_val.lower() not in ("none", "n/a", "null", ""):
                clean_k = str(k).replace("_", " ").title()
                clean_dict[clean_k] = formatted_val
    return clean_dict


def _clean_priority(raw_priority: Any, text_context: str = "") -> str:
    p = str(raw_priority or "").strip().lower()
    if p in ("high", "urgent", "critical"):
        return "high"
    if p in ("low", "minor"):
        return "low"
    if p in ("medium", "normal", "moderate"):
        return "medium"
    
    # Heuristic fallback based on timeframe
    lower_text = text_context.lower()
    if any(w in lower_text for w in ("today", "tomorrow", "urgent", "asap", "immediately", "critical")):
        return "high"
    if any(w in lower_text for w in ("next month", "later", "someday", "future reference")):
        return "low"
    return "medium"


def _extract_title_and_details(item: Dict[str, Any]) -> Tuple[str, str, str, str, List[str], Dict[str, str], Optional[str]]:
    raw_title = item.get("title")
    title = str(raw_title).strip() if raw_title else ""

    raw_details = item.get("detailed_description") or item.get("details") or item.get("description")
    detailed_desc = _format_details_to_text(raw_details)

    # If title is missing, generate concise title from first sentence
    if not title and detailed_desc:
        first_line = detailed_desc.split('\n')[0].strip()
        sentences = [s.strip() for s in re.split(r'[.!?]', first_line) if s.strip()]
        title = sentences[0] if sentences else first_line[:60]
        words = title.split()
        if len(words) > 12:
            title = " ".join(words[:10]) + "..."
    elif not detailed_desc and title:
        detailed_desc = title

    # Extract priority, subtasks, key_context, recommendation
    priority = _clean_priority(item.get("priority"), f"{title} {detailed_desc}")
    subtasks = _clean_subtasks(item.get("subtasks") or item.get("next_actions") or item.get("steps"))
    key_context = _clean_key_context(item.get("key_context") or item.get("context") or item.get("extracted_info"))
    raw_rec = item.get("recommendation") or item.get("ai_recommendation") or item.get("suggestion")
    recommendation = str(raw_rec).strip() if raw_rec and str(raw_rec).strip().lower() not in ("null", "none") else None

    # Form metadata payload
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    subtask_objs = [{"id": f"sub-{i+1}", "title": s, "completed": False} for i, s in enumerate(subtasks)]
    
    metadata_payload = {
        "priority": priority,
        "status": "pending",
        "subtasks": subtask_objs,
        "key_context": key_context,
        "recommendation": recommendation,
        "activity": [
            {
                "id": "act-1",
                "type": "created",
                "description": "AI created task from call",
                "timestamp": now_iso
            }
        ]
    }

    # Form combined single string for storage with metadata block
    metadata_json = json.dumps(metadata_payload, ensure_ascii=False)
    if title and detailed_desc and title.strip().lower() != detailed_desc.strip().lower():
        combined = f"{title}\n\n{detailed_desc}\n\n--- METADATA ---\n{metadata_json}"
    else:
        combined = f"{detailed_desc or title}\n\n--- METADATA ---\n{metadata_json}"

    return title, detailed_desc, combined, priority, subtasks, key_context, recommendation


class JSONValidator:
    """
    Validates and repairs LLM JSON output to enforce dynamic structured CRM schema.
    """

    @staticmethod
    def extract_json_string(text: str) -> str:
        text = text.strip()

        # Remove markdown code block fences if present
        markdown_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if markdown_match:
            return markdown_match.group(1).strip()

        # Search for first '{' and last '}'
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            return text[start_idx:end_idx + 1].strip()

        return text

    @staticmethod
    def repair_json_string(json_str: str) -> str:
        # Strip trailing commas in objects or arrays
        repaired = re.sub(r',\s*([\}\]])', r'\1', json_str)
        return repaired

    @classmethod
    def parse_and_repair(cls, raw_response: str) -> Dict[str, Any]:
        extracted = cls.extract_json_string(raw_response)

        # First attempt: direct JSON parse
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            pass

        # Second attempt: repair trailing commas
        repaired = cls.repair_json_string(extracted)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse LLM JSON output after repair attempt: {str(e)}")

    @classmethod
    def validate_schema(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            raise ValueError("Parsed JSON root must be an object/dict")

        validated = {}

        # 1. Summary
        summary = str(data.get("summary", "")).strip()
        if not summary:
            summary = str(data.get("overview", data.get("briefing", "Call completed."))).strip()
        validated["summary"] = summary

        # 2. Sentiment
        sentiment = str(data.get("sentiment", "")).strip().lower()
        if sentiment not in settings.VALID_SENTIMENTS:
            if "pos" in sentiment:
                sentiment = "positive"
            elif "neg" in sentiment:
                sentiment = "negative"
            else:
                sentiment = "neutral"
        validated["sentiment"] = sentiment

        # 3. Deal Stage
        deal_stage = str(data.get("deal_stage", "")).strip().lower()
        if deal_stage not in settings.VALID_DEAL_STAGES:
            if "prospect" in deal_stage:
                deal_stage = "prospecting"
            elif "negotiat" in deal_stage:
                deal_stage = "negotiation"
            elif "clos" in deal_stage:
                deal_stage = "closing"
            elif "won" in deal_stage or "win" in deal_stage:
                deal_stage = "won"
            elif "lost" in deal_stage or "loss" in deal_stage:
                deal_stage = "lost"
            else:
                deal_stage = "prospecting"
        validated["deal_stage"] = deal_stage

        # 4. Customer Intent
        validated["customer_intent"] = _format_details_to_text(data.get("customer_intent", ""))

        # 5. Products Discussed
        products_raw = data.get("products_discussed", [])
        if isinstance(products_raw, list):
            validated["products_discussed"] = [_format_product(p) for p in products_raw if _format_product(p)]
        elif products_raw:
            formatted = _format_product(products_raw)
            validated["products_discussed"] = [formatted] if formatted else []
        else:
            validated["products_discussed"] = []

        # 5b. Deal Value
        validated["deal_value"] = _extract_deal_value(data)

        # 6. Action Items (Dynamic semantic task generation)
        action_items_raw = data.get("action_items", [])
        action_items = []
        if isinstance(action_items_raw, list):
            for item in action_items_raw:
                if isinstance(item, dict):
                    title, details, combined, priority, subtasks, key_context, recommendation = _extract_title_and_details(item)
                    due_date = _resolve_and_sanitize_date(item.get("due_date"))
                    if combined:
                        action_items.append({
                            "title": title,
                            "detailed_description": details,
                            "description": combined,
                            "priority": priority,
                            "subtasks": subtasks,
                            "key_context": key_context,
                            "recommendation": recommendation,
                            "due_date": due_date
                        })
                elif isinstance(item, str) and item.strip():
                    item_str = item.strip()
                    title, details, combined, priority, subtasks, key_context, recommendation = _extract_title_and_details({"description": item_str})
                    action_items.append({
                        "title": title,
                        "detailed_description": details,
                        "description": combined,
                        "priority": priority,
                        "subtasks": subtasks,
                        "key_context": key_context,
                        "recommendation": recommendation,
                        "due_date": None
                    })
        elif isinstance(action_items_raw, dict):
            title, details, combined, priority, subtasks, key_context, recommendation = _extract_title_and_details(action_items_raw)
            due_date = _resolve_and_sanitize_date(action_items_raw.get("due_date"))
            if combined:
                action_items.append({
                    "title": title,
                    "detailed_description": details,
                    "description": combined,
                    "priority": priority,
                    "subtasks": subtasks,
                    "key_context": key_context,
                    "recommendation": recommendation,
                    "due_date": due_date
                })

        validated["action_items"] = action_items

        # 7. Follow Up
        follow_up_raw = data.get("follow_up", {})
        if isinstance(follow_up_raw, dict):
            req = bool(follow_up_raw.get("required", False))
            dt_str = _resolve_and_sanitize_date(follow_up_raw.get("date"))
            reason = _format_details_to_text(follow_up_raw.get("reason", ""))
            validated["follow_up"] = {
                "required": req,
                "date": dt_str,
                "reason": reason
            }
        else:
            validated["follow_up"] = {
                "required": False,
                "date": None,
                "reason": _format_details_to_text(follow_up_raw)
            }

        return validated

    @classmethod
    def validate_llm_response(cls, raw_response: str) -> Tuple[bool, Dict[str, Any], str]:
        """
        Parses, repairs, and validates raw LLM output against CRM schema.
        Returns: (is_valid, validated_data, error_message)
        """
        try:
            parsed = cls.parse_and_repair(raw_response)
            validated = cls.validate_schema(parsed)
            return True, validated, ""
        except Exception as e:
            return False, {}, str(e)
