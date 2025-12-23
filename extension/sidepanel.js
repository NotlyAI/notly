/**
 * @file Manages the side panel UI and logic for the NotlyAI extension.
 *
 * This script handles all user interactions within the side panel, including
 * navigating between the main view and settings, triggering summarizations,
 * and displaying results. It communicates with the background script to
 * manage the summarization lifecycle and dynamically updates the UI to reflect
 * the current state (e.g., loading, error, or displaying a summary).
 */
document.addEventListener('DOMContentLoaded', () => {
    const main = document.getElementById('main-screen');
    const settings = document.getElementById('settings-screen');
    const resDiv = document.getElementById('result');
    const toast = document.getElementById('long-process-toast');
    const contextValue = document.getElementById('context-value');
    const cancelBtn = document.getElementById('cancel-btn');
    const openSettingsBtn = document.getElementById('open-settings');
    const backHomeBtn = document.getElementById('back-home');
    const summarizeBtn = document.getElementById('summarize');
    const detailSelect = document.getElementById('detail-level');
    const langSelect = document.getElementById('language-select');
    const toneSelect = document.getElementById('tone');
    const githubMain = document.getElementById('github-link-main');
    const donateMain = document.getElementById('donate-main');
    const githubSettings = document.getElementById('github-settings');
    const donateSettings = document.getElementById('donate-settings');

    const port = chrome.runtime.connect({
        name: "keep_alive"
    });
    port.onMessage.addListener(() => {});

    let currentUrl = null;

    chrome.storage.local.get(['detail', 'tone', 'lang'], (res) => {
        if (detailSelect) detailSelect.value = res.detail || 'detailed';
        if (langSelect) langSelect.value = res.lang || 'en';
        if (toneSelect) toneSelect.value = res.tone || 'professional';
    });

    /**
     * Initializes the side panel by identifying the active tab and updating the UI.
     */
    async function init() {
        const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true
        });
        if (tab) {
            currentUrl = tab.url;
            updateUI();
        }
    }

    init();

    chrome.tabs.onActivated.addListener(async (info) => {
        const tab = await chrome.tabs.get(info.tabId);
        currentUrl = tab.url;
        updateUI();
    });

    setInterval(() => {
        if (currentUrl) updateUI();
    }, 1000);

    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            if (main) main.classList.add('hidden');
            if (settings) settings.classList.remove('hidden');
        };
    }

    if (backHomeBtn) {
        backHomeBtn.onclick = () => {
            if (settings) settings.classList.add('hidden');
            if (main) main.classList.remove('hidden');
        };
    }

    /**
     * Opens a new Chrome tab with the specified URL.
     * @param {string} url The URL to open.
     */
    const openLink = (url) => {
        chrome.tabs.create({
            url: url
        });
    };

    if (githubMain) githubMain.onclick = () => openLink('https://g.uptrix.fun');
    if (donateMain) donateMain.onclick = () => openLink('https://d.uptrix.fun');
    if (githubSettings) githubSettings.onclick = () => openLink('https://g.uptrix.fun');
    if (donateSettings) donateSettings.onclick = () => openLink('https://d.uptrix.fun');

    if (summarizeBtn) {
        summarizeBtn.onclick = async () => {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });
            if (tab && tab.url) {
                await chrome.storage.local.set({
                    [`status_${tab.url}`]: 'loading',
                    [`startTime_${tab.url}`]: Date.now()
                });
                chrome.runtime.sendMessage({
                    action: "manual_summarize",
                    tabId: tab.id,
                    url: tab.url
                });
                updateUI();
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = async () => {
            if (currentUrl) {
                await chrome.storage.local.set({
                    [`status_${currentUrl}`]: 'ready'
                });
                chrome.runtime.sendMessage({
                    action: "cancel_summarize",
                    url: currentUrl
                });
                if (toast) toast.classList.remove('visible');
                updateUI();
            }
        };
    }

    if (detailSelect) {
        detailSelect.onchange = () => {
            chrome.storage.local.set({
                detail: detailSelect.value
            });
        };
    }

    if (langSelect) {
        langSelect.onchange = () => {
            chrome.storage.local.set({
                lang: langSelect.value
            });
        };
    }

    if (toneSelect) {
        toneSelect.onchange = () => {
            chrome.storage.local.set({
                tone: toneSelect.value
            });
        };
    }

    /**
     * Displays a loading skeleton in the results area.
     */
    function renderLoading() {
        if (!resDiv) return;
        resDiv.classList.remove('fade-in');
        resDiv.innerHTML = `
            <div class="ai-loading-container">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line medium"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line" style="margin-top:10px"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line medium"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>`;
    }

    /**
     * Fetches the current state from storage and updates the UI accordingly.
     * This function is the central renderer for the side panel.
     */
    async function updateUI() {
        if (!currentUrl) return;
        const res = await chrome.storage.local.get([
            `sum_${currentUrl}`, `status_${currentUrl}`, `startTime_${currentUrl}`, `type_${currentUrl}`
        ]);

        const status = res[`status_${currentUrl}`] || 'ready';
        const summary = res[`sum_${currentUrl}`];
        const sourceType = res[`type_${currentUrl}`];

        if (contextValue) {
            if (sourceType === 'selection') {
                contextValue.textContent = 'Selected Text';
            } else {
                try {
                    contextValue.textContent = new URL(currentUrl).hostname.replace('www.', '');
                } catch {
                    contextValue.textContent = 'Web Page';
                }
            }
        }

        const startTime = res[`startTime_${currentUrl}`];
        if (toast) {
            if (status === 'loading' && startTime && (Date.now() - startTime > 5000)) {
                toast.classList.add('visible');
            } else {
                toast.classList.remove('visible');
            }
        }

        if (status === 'loading') {
            setLoad(true);
            if (resDiv && !resDiv.querySelector('.ai-loading-container')) renderLoading();
        } else {
            setLoad(false);
            if (!resDiv) return;

            if (summary && summary.startsWith('Error:')) {
                resDiv.classList.remove('fade-in');
                resDiv.innerHTML = `<div class="empty-state"><img src="icon/error.svg" class="state-icon"><p style="color:#ff4f44">Analysis Failed</p><span>${summary.replace('Error: ', '')}</span></div>`;
            } else if (summary) {
                if (resDiv.dataset.currentSum !== summary) {
                    resDiv.dataset.currentSum = summary;
                    resDiv.classList.remove('fade-in');

                    let htmlContent = typeof marked !== 'undefined' ? marked.parse(summary) : summary;
                    resDiv.innerHTML = htmlContent;

                    resDiv.querySelectorAll('hr').forEach(el => el.remove());
                    resDiv.querySelectorAll('li, p').forEach(el => {
                        let txt = el.textContent.trim();
                        if (el.tagName === 'LI') {
                            el.innerHTML = el.innerHTML.replace(/^[\u2022\u00b7\u25cf]\s*/, '');
                            txt = el.textContent.trim();
                        }
                        if (!txt || /^[\.\-\*\•\·\_\—\s]+$/.test(txt)) {
                            el.remove();
                        }
                    });

                    resDiv.querySelectorAll('a').forEach(link => {
                        link.setAttribute('target', '_blank');
                        link.style.color = '#4da6ff';
                    });

                    void resDiv.offsetWidth;
                    resDiv.classList.add('fade-in');
                }
            } else {
                resDiv.classList.remove('fade-in');
                resDiv.innerHTML = `<div class="empty-state"><img src="icon/star.svg" class="state-icon"><p>Ready to illuminate?</p><span>Click the button below to start</span></div>`;
            }
        }
    }

    /**
     * Sets the loading state of the main "Summarize" button.
     * @param {boolean} isLoading - True to show loading state, false otherwise.
     */
    function setLoad(isLoading) {
        const btn = document.getElementById('summarize');
        const loader = document.getElementById('btn-loader');
        const txt = document.getElementById('btn-text');

        if (!btn || !loader || !txt) return;

        if (isLoading) {
            btn.disabled = true;
            loader.classList.remove('hidden');
            txt.textContent = 'Thinking...';
        } else {
            btn.disabled = false;
            loader.classList.add('hidden');
            txt.textContent = 'Summarize';
        }
    }
});