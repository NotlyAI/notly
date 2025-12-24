<p align="center">
  <img src="extension/icon/icon.png" width="128" alt="Notly Logo">
</p>

# Notly

**Notly** is an intelligent, open-source AI assistant for your browser. It transforms how you interact with the web by allowing you to chat with any page, summarize content, and analyze specific text selections instantly.

Powered by **Llama 3.3 70B** via the **Groq API**, Notly delivers lightning-fast, context-aware responses while maintaining strict privacy standards.

## ✨ Features

- **Chat with Page:** Ask questions about the current tab's content
- **Smart Selection:** Highlight text to analyze, translate, or explain specific sections
- **Context Awareness:** Understands the structure and nuance of web content
- **Privacy First:** No history storage, no tracking, transient data processing
- **Markdown Support:** Renders rich text, code blocks, and clickable links

## 📥 Installation

**[Download Notly from Chrome Web Store](https://uptrix.fun)**
*(Link coming soon)*

---

## 👨‍💻 Development

### Architecture

1.  **Extension (Client):** Captures DOM content, handles user UI (Side Panel), and manages state.
2.  **Backend (Server):** FastAPI wrapper for LLM interaction with strict Origin verification.

### Self-Hosting the Backend

1.  Clone the repo:
    ```bash
    git clone https://github.com/NotlyAI/notly.git
    cd backend
    ```

2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Configure environment:
    Create `.env` and add your Groq API keys:
    ```env
    GROQ_API_KEYS=gsk_...,gsk_...
    ```

4.  Run the server:
    ```bash
    python main.py
    ```

**Security Note:** The backend enforces an `Origin` header check. It will only accept requests from Chrome Extensions (`chrome-extension://`).

## 🛡 License

MIT License. Free and open source forever.