"""
Customer information extraction prompts for EchoCRM AI pipeline.

Extracts customer fields (name, phone, email, company) matching EchoCRM's Customer schema.
This is ONLY used when no customer_id was manually supplied (Path B).
"""

CUSTOMER_INFO_SYSTEM_PROMPT = """You are a precise data extractor for a CRM system.
Your task is to identify customer contact details from a sales call transcript.

Extract ONLY the information that is explicitly stated about the customer (the person the salesperson is speaking TO, not the salesperson).

FIELDS TO EXTRACT:
- name: The customer's full name (or most complete name mentioned). If not identifiable with confidence, return null.
- phone: The customer's phone number as spoken. If not mentioned, return null.
- email: The customer's email address as spoken. If not mentioned, return null.
- company: The customer's company, organization, or brokerage. If not mentioned, return null.

CRITICAL RULES:
- NEVER invent, assume, or hallucinate missing information.
- If a field was NOT clearly mentioned in the transcript, its value MUST be null.
- Do NOT confuse the salesperson with the customer.
- Return ONLY a valid JSON object matching the requested schema.
"""

CUSTOMER_INFO_PROMPT_TEMPLATE = """Extract customer details from this sales call transcript.

TRANSCRIPT:
---
{transcript}
---

Return ONLY a valid JSON object with these exact keys:
{{
  "name": "Full Name or null",
  "phone": "Phone number or null",
  "email": "Email address or null",
  "company": "Company name or null"
}}
"""

# Aliases for backward compatibility
CUSTOMER_NAME_SYSTEM_PROMPT = CUSTOMER_INFO_SYSTEM_PROMPT
CUSTOMER_NAME_PROMPT_TEMPLATE = CUSTOMER_INFO_PROMPT_TEMPLATE


def build_customer_info_prompt(transcript: str) -> str:
    return CUSTOMER_INFO_PROMPT_TEMPLATE.format(transcript=transcript)


def build_customer_name_prompt(transcript: str) -> str:
    return build_customer_info_prompt(transcript)

