document.addEventListener('DOMContentLoaded', () => {
    const app = {
        elements: {
            input: document.getElementById('user-input'),
            sendBtn: document.getElementById('send-btn'),
            chatArea: document.getElementById('chat-area'),
            quickPrompts: document.getElementById('quick-prompts'),
            contextValue: document.getElementById('context-value'),
            supportOverlay: document.getElementById('support-overlay'),
            quotePreview: document.getElementById('quote-preview'),
            quoteText: document.getElementById('quote-text-content'),
            closeQuote: document.getElementById('close-quote'),
            supportTimer: document.getElementById('support-timer')
        },
        state: {
            currentUrl: null,
            tabId: null,
            isLoading: false,
            requestTimestamps: [],
            currentSelection: null,
            isSystemPage: false
        },

        init() {
            this.setupConnection();
            this.setupListeners();
            this.checkActiveTab();
            this.setupMessageListener();
            setInterval(() => this.checkActiveTab(), 1000);
            this.loadRequestHistory();
        },

        setupConnection() {
            const port = chrome.runtime.connect({ name: "keep_alive" });
            port.onMessage.addListener(() => {});
        },

        setupMessageListener() {
            chrome.runtime.onMessage.addListener((req) => {
                if (req.action === "trigger_selection_ui") {
                    this.handleSelectionEvent(req.text);
                }
            });
        },

        setupListeners() {
            this.elements.input.addEventListener('input', () => {
                this.resizeInput();
                this.elements.sendBtn.disabled = this.elements.input.value.trim() === '';
            });

            this.elements.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });

            this.elements.sendBtn.addEventListener('click', () => this.handleSend());
            this.elements.closeQuote.addEventListener('click', () => this.clearSelection());

            document.querySelectorAll('.chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    const prompt = btn.dataset.prompt;
                    this.elements.input.value = prompt;
                    this.resizeInput();
                    this.elements.sendBtn.disabled = false;
                    this.handleSend();
                });
            });
        },

        resizeInput() {
            this.elements.input.style.height = 'auto';
            this.elements.input.style.height = this.elements.input.scrollHeight + 'px';
        },

        isSystemUrl(url) {
            return !url || 
                   url.startsWith('chrome://') || 
                   url.startsWith('edge://') || 
                   url.startsWith('about:') || 
                   url.startsWith('chrome-extension://') ||
                   url.includes('notly.dev');
        },

        async checkActiveTab() {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            
            if (tab && tab.id) {
                if (tab.id !== this.state.tabId || tab.url !== this.state.currentUrl) {
                    
                    this.clearSelection();

                    this.state.tabId = tab.id;
                    this.state.currentUrl = tab.url;
                    
                    if (this.isSystemUrl(tab.url)) {
                        this.state.isSystemPage = true;
                        this.renderSystemPageError();
                        this.elements.input.disabled = true;
                        this.elements.sendBtn.disabled = true;
                        this.elements.quickPrompts.classList.add('hidden');
                        this.elements.contextValue.textContent = "System Page";
                        return;
                    } else {
                        this.state.isSystemPage = false;
                        this.elements.input.disabled = false;
                    }
                    
                    try {
                        const urlObj = new URL(tab.url);
                        this.elements.contextValue.textContent = urlObj.hostname.replace('www.', '');
                    } catch {
                        this.elements.contextValue.textContent = 'Web Page';
                    }

                    await this.loadChat(tab.id, tab.url);
                    this.checkPendingSelection(tab.id);
                }
            }
        },

        renderSystemPageError() {
            this.elements.chatArea.innerHTML = '';
            this.elements.chatArea.classList.add('empty-view');
            const div = document.createElement('div');
            div.className = 'empty-state';
            div.innerHTML = `
                <img src="icon/error.svg" class="state-icon error-icon" alt="Restricted">
                <h2>Restricted Access</h2>
                <span>Notly cannot analyze browser system pages or settings</span>
            `;
            this.elements.chatArea.appendChild(div);
        },

        async loadChat(tabId, url) {
            const key = `chat_${tabId}`;
            const result = await chrome.storage.local.get(key);
            const data = result[key];

            this.elements.chatArea.innerHTML = '';
            this.elements.chatArea.classList.remove('empty-view');

            if (data && data.url === url && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    this.appendMessage(msg.role, msg.content, false);
                });
                this.elements.quickPrompts.classList.add('hidden');
            } else {
                this.elements.chatArea.classList.add('empty-view');
                this.renderEmptyState();
                this.elements.quickPrompts.classList.remove('hidden');
            }
            this.scrollToBottom();
        },

        renderEmptyState() {
            this.elements.chatArea.innerHTML = `
                <div class="empty-state">
                    <img src="icon/star.svg" class="state-icon" alt="Star">
                    <h2>Ready to help</h2>
                    <span>Ask me anything about this page</span>
                </div>
            `;
        },

        async saveChat(role, content) {
            if (!this.state.tabId || this.state.isSystemPage) return;
            const key = `chat_${this.state.tabId}`;
            
            const result = await chrome.storage.local.get(key);
            let history = result[key] || { url: this.state.currentUrl, messages: [] };
            
            if (history.url !== this.state.currentUrl) {
                history = { url: this.state.currentUrl, messages: [] };
            }

            history.messages.push({ role, content });
            await chrome.storage.local.set({ [key]: history });
        },

        async checkPendingSelection(tabId) {
            const key = `selection_${tabId}`;
            const res = await chrome.storage.local.get(key);
            if (res[key]) {
                this.handleSelectionEvent(res[key]);
                chrome.storage.local.remove(key);
            }
        },

        handleSelectionEvent(text) {
            if (!text || this.state.isSystemPage) return;
            this.state.currentSelection = text;
            this.elements.quoteText.textContent = text;
            this.elements.quotePreview.classList.remove('hidden');
            this.elements.input.focus();
        },

        clearSelection() {
            this.state.currentSelection = null;
            this.elements.quotePreview.classList.add('hidden');
            this.elements.quoteText.textContent = '';
        },

        loadRequestHistory() {
            const stored = localStorage.getItem('req_timestamps');
            if (stored) {
                this.state.requestTimestamps = JSON.parse(stored);
            }
        },

        checkRateLimit() {
            const now = Date.now();
            const TEN_MINUTES = 10 * 60 * 1000;
            const LIMIT_COUNT = 10;
            
            this.state.requestTimestamps = this.state.requestTimestamps.filter(t => now - t < TEN_MINUTES);
            
            if (this.state.requestTimestamps.length >= LIMIT_COUNT) {
                this.showSupportOverlay();
                return false;
            }
            
            this.state.requestTimestamps.push(now);
            localStorage.setItem('req_timestamps', JSON.stringify(this.state.requestTimestamps));
            return true;
        },

        showSupportOverlay() {
            this.elements.supportOverlay.classList.remove('hidden');
            let timeLeft = 300; 
            
            this.elements.supportOverlay.querySelector('p').innerHTML = `High server traffic. Please wait <span id="support-timer" class="timer">5:00</span> before your next request`;

            const updateTimer = () => {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                this.elements.supportTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            };
            
            updateTimer();
            
            const timer = setInterval(() => {
                timeLeft--;
                updateTimer();
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    this.elements.supportOverlay.classList.add('hidden');
                    this.state.requestTimestamps = []; 
                    localStorage.setItem('req_timestamps', '[]');
                }
            }, 1000);
        },

        async handleSend() {
            if (this.state.isSystemPage) return;
            
            let text = this.elements.input.value.trim();
            if (!text || this.state.isLoading) return;
            if (!this.checkRateLimit()) return;

            const emptyState = this.elements.chatArea.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
                this.elements.chatArea.classList.remove('empty-view');
            }

            this.elements.input.value = '';
            this.resizeInput();
            this.elements.sendBtn.disabled = true;
            this.state.isLoading = true;
            this.elements.quickPrompts.classList.add('hidden');
            
            let promptToSend = text;
            let displayHtml = text;

            if (this.state.currentSelection) {
                promptToSend = `> ${this.state.currentSelection}\n\n${text}`;
                displayHtml = `<blockquote>${this.escapeHtml(this.state.currentSelection)}</blockquote>${this.escapeHtml(text)}`;
                this.clearSelection();
            } else {
                displayHtml = this.escapeHtml(text);
            }

            this.appendMessage('user', displayHtml, true);
            const loadingId = this.appendLoading();

            try {
                const response = await chrome.runtime.sendMessage({
                    action: "send_chat",
                    tabId: this.state.tabId,
                    url: this.state.currentUrl,
                    prompt: promptToSend
                });

                this.removeLoading(loadingId);

                if (response && response.success) {
                    this.appendMessage('ai', response.data, true);
                } else {
                    const errMsg = response.error || 'Unknown error';
                    this.renderErrorState(errMsg);
                }
            } catch (err) {
                this.removeLoading(loadingId);
                this.renderErrorState(`Connection failed: ${err.message}`);
            } finally {
                this.state.isLoading = false;
                this.elements.input.focus();
            }
        },

        renderErrorState(message) {
            if (this.elements.chatArea.children.length === 0) {
                 this.elements.chatArea.classList.add('empty-view');
            }

            const div = document.createElement('div');
            div.className = 'empty-state';
            div.innerHTML = `
                <img src="icon/error.svg" class="state-icon error-icon" alt="Error">
                <h2 style="color:#ff4f44">Something went wrong</h2>
                <span>${message}</span>
            `;
            this.elements.chatArea.appendChild(div);
            this.scrollToBottom();
        },

        escapeHtml(text) {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        },

        appendMessage(role, textOrHtml, saveToStorage = true) {
            const div = document.createElement('div');
            div.className = `message ${role}-message`;
            
            if (role === 'ai') {
                div.innerHTML = marked.parse(textOrHtml);
                div.querySelectorAll('a').forEach(a => a.target = '_blank');
            } else {
                if (textOrHtml.includes('<blockquote>')) {
                    div.innerHTML = textOrHtml;
                } else {
                    div.innerText = textOrHtml; 
                }
            }

            this.elements.chatArea.appendChild(div);
            this.scrollToBottom();

            if (saveToStorage) {
                this.saveChat(role, textOrHtml);
            }
        },

        appendLoading() {
            const id = 'loading-' + Date.now();
            const div = document.createElement('div');
            div.id = id;
            div.className = 'message ai-message ai-loading';
            div.innerHTML = '<div class="ai-loading-bubble"></div>';
            this.elements.chatArea.appendChild(div);
            this.scrollToBottom();
            return id;
        },

        removeLoading(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        },

        scrollToBottom() {
            this.elements.chatArea.scrollTop = this.elements.chatArea.scrollHeight;
        }
    };

    app.init();
});