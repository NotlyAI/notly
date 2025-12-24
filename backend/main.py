import uvicorn
import os
from fastapi import FastAPI, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(override=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    text: str
    prompt: str

def clean_text(text: str) -> str:
    """
    Sanitizes the input string by encoding and decoding UTF-8 to remove incompatible characters.
    """
    try:
        return text.encode('utf-8', 'ignore').decode('utf-8')
    except:
        return ""

@app.post("/chat")
async def chat(request: ChatRequest, origin: str | None = Header(default=None)):
    """
    Process chat requests using the Llama 3.3 model via Groq API.
    Enforces origin checks to restrict usage to the specific Chrome Extension.
    """
    if not origin or not origin.startswith("chrome-extension://"):
        return {"response": "Error: Access denied. Requests must originate from the Notly extension"}

    keys_str = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY") or ""
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not api_keys:
        return {"response": "Error: Server config error (No API keys)"}

    cleaned_text = clean_text(request.text)
    safe_text_length = 30000
    truncated_text = cleaned_text[:safe_text_length]

    system_message = (
        "You are Notly, an intelligent AI assistant. "
        "IMPORTANT: DETECT the language of the User Question. "
        "ALWAYS answer in the EXACT SAME language as the User Question. "
        "If the user asks in Russian, answer in Russian. If in English, answer in English. "
        "Answer the question based strictly on the provided context. "
        "If the user includes a quoted selection, focus your answer on that specific part. "
        "If you find URLs or links in the text that are relevant to the answer, include them formatted as Markdown [Link Text](URL). "
        "Use Markdown for formatting. Be concise, professional, and direct. "
        "DO NOT end your sentences with a period if it is a single sentence header or short status message."
    )

    user_content = f"Context:\n{truncated_text}\n\nUser Question:\n{request.prompt}"

    last_error = "No attempts"
    for key in api_keys:
        try:
            client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3,
                max_tokens=4096
            )
            return {"response": completion.choices[0].message.content.strip()}
        except Exception as e:
            last_error = str(e)
            continue
            
    return {"response": f"Service Error: {last_error}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)