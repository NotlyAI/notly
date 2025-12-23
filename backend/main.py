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
    text: str
    language: str  # Ожидаем "en" или "ru"
    detail_level: str
    tone: str

def clean_text(text: str) -> str:
    try:
        return text.encode('utf-8', 'ignore').decode('utf-8')
    except:
        return ""

@app.post("/summarize")
async def summarize(request: SummarizeRequest):
    # 1. Логгируем, что пришло (Смотри в черное окно терминала!)
    print(f"Incoming Request -> Lang: {request.language} | Tone: {request.tone}")

    keys_str = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY") or ""
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]

    if not api_keys:
        return {"summary": "Error: No API keys found."}

    cleaned_text = clean_text(request.text)
    safe_text_length = 35000
    truncated_text = cleaned_text[:safe_text_length]

    # 2. ЖЕЛЕЗОБЕТОННАЯ ЛОГИКА ЯЗЫКА
    # Если пришло "ru", "ru-RU", "russian" -> Русский. Иначе ВСЕГДА Английский.
    if request.language.lower().startswith("ru"):
        target_lang = "Russian"
        strict_lang_rule = "Отвечай ТОЛЬКО на русском языке."
    else:
        target_lang = "English"
        strict_lang_rule = "Answer ONLY in English."

    # Настройка Тона
    if request.tone == "casual":
        tone_prompt = "Casual, conversational, easy to read. Like a blog post."
    else:
        tone_prompt = "Professional, analytical, precise. No fluff."

    # Настройка Детализации
    if request.detail_level == "detailed":
        task_prompt = (
            f"Analyze the input text and create a COMPREHENSIVE SUMMARY in {target_lang}. "
            "Do NOT use a fixed template. ADAPT structure to content.\n"
            "- **If Profile:** Focus on Skills & History.\n"
            "- **If Code:** Focus on Logic & Syntax.\n"
            "- **If Article:** Focus on Arguments & Impact.\n\n"
            "**RULES:**\n"
            "1. NO REPETITION.\n"
            "2. Use descriptive headers.\n"
            "3. Write detailed paragraphs."
        )
    else:
        task_prompt = (
            f"Create a concise summary in {target_lang}. "
            "Structure:\n"
            "1. **# Main Title** (H1)\n"
            "2. One clear summary paragraph.\n"
            "3. **## Key Points**: 3-5 bullet points."
        )

    system_prompt = f"""You are an intelligent content analyst.

CRITICAL RULES:
1. **OUTPUT LANGUAGE: {target_lang}**. {strict_lang_rule}
2. TONE: {tone_prompt}
3. FORMAT: Markdown (# H1, ## H2, - bullets).
4. LINKS: Preserve URLs as [Link Text](URL).
5. FORBIDDEN: Do NOT start with "TL;DR" or "Here is the summary".
6. CONTENT TASK: {task_prompt}"""

    last_error = "No attempts made"

    for i, key in enumerate(api_keys):
        try:
            print(f"Trying key {i+1}...")
            client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=key)
            
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": truncated_text}
                ],
                temperature=0.3, 
                max_tokens=4096
            )
            
            return {"summary": completion.choices[0].message.content.strip()}
            
        except Exception as e:
            error_msg = clean_text(str(e))
            print(f"Key {i+1} failed: {error_msg}")
            last_error = error_msg
            continue

    return {"summary": f"System error. Last error: {last_error}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)