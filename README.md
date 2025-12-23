# NotlyAI

**NotlyAI** is an open-source Google Chrome extension designed for semantic text analysis and summarization. It utilizes a client-server architecture where the browser extension captures page content and communicates with a Python-based backend powered by Large Language Models (LLM).

The system leverages the Llama 3.3 70B model via the Groq API to provide high-speed, context-aware summaries in English and Russian.

## 📥 Download

**[Download NotlyAI from Chrome Web Store](https://uptrix.fun)**
*(Link will be available soon)*

---

## 👨‍💻 Development & Self-Hosting

The following instructions are intended for developers who wish to contribute to the project or host their own instance of the backend.

### Architecture Overview

The project consists of two core components:
1.  **Browser Extension (Client):** Handles UI and DOM extraction.
2.  **Backend API (Server):** FastAPI application handling LLM requests.

### Prerequisites

*   **Python:** Version 3.10+.
*   **Browser:** Chromium-based browser (Chrome, Edge, Brave).
*   **API Access:** Valid Groq API keys.

### 1. Backend Setup

To run the backend locally:

1.  Clone the repository:
    ```bash
    git clone https://github.com/uptrix/NotlyAI.git
    cd NotlyAI/backend
    ```

2.  Create a virtual environment and install dependencies:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

3.  Configuration:
    Create a `.env` file in the `backend` directory. Add your Groq API keys:
    ```env
    GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3
    ```

4.  Start the server:
    ```bash
    python main.py
    ```

### 2. Extension Setup (Developer Mode)

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select the project folder containing `manifest.json`.

**Note:** By default, the extension connects to `http://127.0.0.1:8000`. If you are running a production server, update the API URL in `background.js`.

## 🛡 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.