let activeRequests = {};

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({
            url: "https://notly.dev/thanks"
        });
    }

    chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
    });

    chrome.contextMenus.create({
        id: "ask_notly",
        title: "Ask Notly about this...",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "ask_notly" && tab.id) {
        chrome.sidePanel.open({ tabId: tab.id });

        chrome.storage.local.set({
            [`selection_${tab.id}`]: info.selectionText
        }).then(() => {
            chrome.runtime.sendMessage({
                action: "trigger_selection_ui",
                tabId: tab.id,
                text: info.selectionText
            }).catch(() => {});
        });
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove([
        `chat_${tabId}`,
        `selection_${tabId}`
    ]);
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "keep_alive") {
        const keepAliveInterval = setInterval(() => {
            port.postMessage({ status: "alive" });
        }, 20000);

        port.onDisconnect.addListener(() => {
            clearInterval(keepAliveInterval);
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "send_chat") {
        handleChatRequest(request.tabId, request.url, request.prompt)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function handleChatRequest(tabId, url, prompt) {
    try {
        if (!url || url.startsWith('chrome://')) {
            throw new Error("Cannot analyze internal browser pages");
        }

        let text = "";
        try {
            const [res] = await chrome.scripting.executeScript({
                target: { tabId: tabId },
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
            throw new Error("Permission denied. Refresh the page");
        }

        if (!text || text.length < 20) {
            throw new Error("Page content is too short");
        }

        const controller = new AbortController();
        activeRequests[tabId] = controller;
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const textToSend = text.substring(0, 30000);

        const response = await fetch('https://api.notly.dev/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToSend,
                prompt: prompt
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        delete activeRequests[tabId];

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        return data.response;

    } catch (e) {
        if (activeRequests[tabId]) delete activeRequests[tabId];
        throw e;
    }
}