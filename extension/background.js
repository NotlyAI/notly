let activeRequests = {};

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({
            url: "https://notly.uptrix.fun/thanks"
        });
    }

    chrome.contextMenus.create({
        id: "summarize_selection",
        title: "Summarize selection with Notly",
        contexts: ["selection"]
    });
    
    chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
    });
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "keep_alive") {
        const keepAliveInterval = setInterval(() => {
            port.postMessage({
                status: "alive"
            });
        }, 20000);

        port.onDisconnect.addListener(() => {
            clearInterval(keepAliveInterval);
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "summarize_selection" && tab && tab.url) {
        chrome.sidePanel.open({
            tabId: tab.id
        });
        setTimeout(() => {
            startBackgroundSummarize(tab.id, tab.url, info.selectionText);
        }, 500);
    }
});

chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action === "manual_summarize") {
        startBackgroundSummarize(request.tabId, request.url);
    }
    if (request.action === "cancel_summarize") {
        const tabId = request.tabId;
        const url = request.url;
        if (activeRequests[tabId]) {
            activeRequests[tabId].abort();
            delete activeRequests[tabId];
        }
        chrome.storage.local.set({
            [`status_${url}`]: 'done',
            [`startTime_${url}`]: null
        });
    }
});

async function startBackgroundSummarize(tabId, url, selectedText = null) {
    try {
        if (!url || url.startsWith('chrome://')) {
            throw new Error("Cannot summarize internal browser pages.");
        }

        await chrome.storage.local.set({
            [`status_${url}`]: 'loading',
            [`startTime_${url}`]: Date.now(),
            [`type_${url}`]: selectedText ? 'selection' : 'page'
        });

        let text = "";
        if (selectedText) {
            text = selectedText;
        } else {
            try {
                const [res] = await chrome.scripting.executeScript({
                    target: {
                        tabId: tabId
                    },
                    func: () => {
                        if (document.contentType === 'application/pdf') return window.getSelection().toString() || document.body.innerText;
                        let contentNode = document.querySelector('main') || document.querySelector('article') || document.body;
                        const clone = contentNode.cloneNode(true);
                        const tags = ['nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript', 'svg', 'iframe', 'ads', 'img', 'button', 'input', 'textarea', 'form', 'select'];
                        tags.forEach(s => clone.querySelectorAll(s).forEach(el => el.remove()));
                        
                        let cleanText = clone.innerText;
                        cleanText = cleanText.replace(/\u00A0/g, ' ');
                        cleanText = cleanText.replace(/\s\s+/g, ' ').trim();
                        return cleanText;
                    }
                });
                text = res?.result;
            } catch (scriptError) {
                throw new Error("Permission denied. Please refresh the page or check extension permissions.");
            }
        }

        if (!text || text.length < 20) {
            throw new Error("Page content is too short to summarize.");
        }

        const settings = await chrome.storage.local.get(['detail', 'tone', 'lang']);

        const controller = new AbortController();
        activeRequests[tabId] = controller;
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        const textToSend = text.substring(0, 8000);

        const response = await fetch('https://api.notly.uptrix.fun/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: textToSend,
                language: settings.lang || 'ru',
                detail_level: settings.detail || 'concise',
                tone: settings.tone || 'professional'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        delete activeRequests[tabId];

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.summary || `Server error: ${response.status}`);
        }

        const data = await response.json();

        await chrome.storage.local.set({
            [`sum_${url}`]: data.summary,
            [`status_${url}`]: 'done',
            [`startTime_${url}`]: null
        });

    } catch (e) {
        if (activeRequests[tabId]) delete activeRequests[tabId];

        await chrome.storage.local.set({
            [`sum_${url}`]: `Error: ${e.message}`,
            [`status_${url}`]: 'done',
            [`startTime_${url}`]: null
        });
    }
}