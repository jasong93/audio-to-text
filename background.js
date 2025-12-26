chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
});

// 存储当前捕获状态
let isCapturing = false;
let currentTabId = null;
let audioStream = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startCapture') {
        startAudioCapture();
        sendResponse({ success: true });
    } else if (message.action === 'stopCapture') {
        stopAudioCapture();
        sendResponse({ success: true });
    } else if (message.action === 'checkCaptureStatus') {
        sendResponse({ isCapturing });
    } else if (message.action === 'textUpdate') {
        // 将识别结果转发到popup
        chrome.runtime.sendMessage({
            action: 'textUpdate',
            text: message.text
        });
    }
    return true;
});

// 开始音频捕获和识别
async function startAudioCapture() {
    if (isCapturing) {
        console.log('Already capturing');
        return;
    }

    try {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            console.error('No active tab found');
            return;
        }

        currentTabId = tab.id;

        // 捕获当前标签页的音频流
        chrome.tabCapture.capture({ audio: true }, async (stream) => {
            if (chrome.runtime.lastError) {
                console.error('Capture error:', chrome.runtime.lastError.message);
                return;
            }

            if (stream) {
                audioStream = stream;
                isCapturing = true;
                console.log('Audio stream captured');

                // 注入content script到当前标签页
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: currentTabId },
                        files: ['content.js']
                    });

                    // 等待content script加载后启动识别
                    setTimeout(() => {
                        chrome.tabs.sendMessage(currentTabId, { action: 'startRecognition' }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to start recognition:', chrome.runtime.lastError.message);
                            } else if (response && response.success) {
                                console.log('Speech recognition started');
                            }
                        });
                    }, 500);
                } catch (error) {
                    console.error('Failed to inject content script:', error);
                }
            } else {
                console.error('Failed to capture audio stream');
            }
        });
    } catch (error) {
        console.error('Error starting capture:', error);
    }
}

// 停止音频捕获和识别
async function stopAudioCapture() {
    if (!isCapturing) {
        return;
    }

    isCapturing = false;

    // 停止content script中的识别
    if (currentTabId) {
        try {
            chrome.tabs.sendMessage(currentTabId, { action: 'stopRecognition' });
        } catch (error) {
            console.error('Error stopping recognition:', error);
        }
    }

    // 停止音频流
    if (audioStream) {
        const tracks = audioStream.getTracks();
        tracks.forEach(track => track.stop());
        audioStream = null;
    }

    currentTabId = null;
    console.log('Audio capture stopped');
}