"""
This module implements the backend server for the NotlyAI summarization service.

It uses FastAPI to create a web server that exposes a `/summarize` endpoint.
The server accepts text and summarization parameters, then communicates with the
Groq API to generate a high-quality, structured summary using a large language model.
The module is designed to be resilient, supporting multiple API keys and falling back
if one key fails.
"""
import uvicorn
import os
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SummarizeRequest(BaseModel):
    """Defines the data structure for a summarization request."""
    text: str
    language: str
    detail_level: str
    tone: str

def clean_text(text: str) -> str:
    """
    Sanitizes a string by attempting to encode and decode it as UTF-8,
    ignoring any characters that cannot be processed.

    Args:
        text: The input string to clean.

    Returns:
        The cleaned string, or an empty string if an error occurs.
    """
    try:
        return text.encode('utf-8', 'ignore').decode('utf-8')
    except:
        return ""

@app.post("/summarize")
async def summarize(request: SummarizeRequest):
    """
    Handles the summarization request by calling the Groq API.

    This function retrieves API keys from environment variables, prepares a
    dynamically generated prompt based on user-specified detail and tone,
    and then attempts to generate a summary by trying each API key in sequence
    until one succeeds.

    Args:
        request: A `SummarizeRequest` object containing the text and parameters.

    Returns:
        A dictionary with the generated summary or an error message if all
        API calls fail.
    """
    keys_str = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY") or ""
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]

    if not api_keys:
        return {"summary": "Error: Server config error (No API keys)."}

    cleaned_text = clean_text(request.text)
    safe_text_length = 35000
    truncated_text = cleaned_text[:safe_text_length]

    if request.language.lower().startswith("ru"):
        target_lang_name = "Russian"
        lang_instruction = "ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ."
    else:
        target_lang_name = "English"
        lang_instruction = "ANSWER ONLY IN ENGLISH. Even if the text is in Russian, translate and summarize in English."

    if request.tone == "casual":
        tone_prompt = "Casual, simple, blog-style."
    else:
        tone_prompt = "Professional, analytical, concise."

    if request.detail_level == "detailed":
        task_description = (
            f"Create a COMPREHENSIVE ANALYSIS in {target_lang_name}.\n"
            "1. Title (H1)\n"
            "2. Detailed Context (paragraph)\n"
            "3. Key Takeaways (bullet points with explanations)\n"
            "4. Deep Analysis (H2)\n"
            "5. Conclusion"
        )
    else:
        task_description = (
            f"Create a CONCISE SUMMARY in {target_lang_name}.\n"
            "1. Title (H1)\n"
            "2. Short Summary Paragraph\n"
            "3. 3-5 Key Bullet Points"
        )

    system_message = f"""You are a professional content summarizer.
STRICT RULES:
1. OUTPUT LANGUAGE: {target_lang_name} ONLY. {lang_instruction}
2. Tone: {tone_prompt}
3. Format: Markdown.
4. Content: {task_description}"""

    user_message_content = f"Text to summarize:\n\n{truncated_text}\n\n---\nREMINDER: OUTPUT MUST BE IN {target_lang_name.upper()}!"

    last_error = "No attempts"

    for i, key in enumerate(api_keys):
        try:
            client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message_content}
                ],
                temperature=0.3,
                max_tokens=4096
            )
            return {"summary": completion.choices[0].message.content.strip()}
        except Exception as e:
            last_error = str(e)
            continue

    return {"summary": f"Service Error: {last_error}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)