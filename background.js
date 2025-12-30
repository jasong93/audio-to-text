chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
});

// 存储当前识别状态
let isCapturing = false;
let currentTabId = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'audioStreamCaptured') {
        console.log("Audio stream captured, starting recognition for tab:", message.tabId);
        startRecognition(message);
        sendResponse({ success: true });
    } else if (message.action === 'recognizeAudio') {
        // 处理音频数据识别
        recognizeAudioData(message.audioData, message.sampleRate, message.format)
            .then(text => {
                if (text) {
                    // 发送识别结果
                    chrome.runtime.sendMessage({
                        action: 'textUpdate',
                        text: text
                    });
                }
            })
            .catch(error => {
                console.error('Recognition error:', error);
            });
        sendResponse({ success: true });
    } else if (message.action === 'stopCapture') {
        stopRecognition();
        sendResponse({ success: true });
    } else if (message.action === 'checkCaptureStatus') {
        sendResponse({ isCapturing });
    } else if (message.action === 'textUpdate') {
        // 将识别结果转发到popup
        // 使用chrome.storage存储最新文本，确保popup打开时能获取
        chrome.storage.local.get(['recognizedTexts'], (result) => {
            const texts = result.recognizedTexts || [];
            texts.push(message.text);
            // 只保留最近100条记录
            const recentTexts = texts.slice(-100);
            chrome.storage.local.set({ 
                lastRecognizedText: message.text,
                recognizedTexts: recentTexts
            }, () => {
                // 尝试发送消息到popup（如果popup打开）
                chrome.runtime.sendMessage({
                    action: 'textUpdate',
                    text: message.text
                }).catch(() => {
                    // popup可能已关闭，消息会失败，但文本已保存到storage
                    console.log('Popup not open, text saved to storage');
                });
            });
        });
    }
    return true;
});

// 开始语音识别
async function startRecognition(message) {
    if (!message) {
        console.error('No message provided');
        return;
    }

    if (isCapturing) {
        console.log('Recognition already started');
        return;
    }

    currentTabId = message.tabId;
    isCapturing = true;
    console.log('Starting recognition for tab:', message.tabId);

    // 注入content script到当前标签页
    try {
        console.log('Injecting content script into tab:', currentTabId);
        await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['content.js']
        });
        console.log('Content script injected successfully');

        // 等待content script加载后启动识别
        setTimeout(() => {
            console.log('Sending startRecognition message');
            chrome.tabs.sendMessage(currentTabId, { action: 'startRecognition' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to start recognition:', chrome.runtime.lastError.message);
                    isCapturing = false;
                } else if (response && response.success) {
                    console.log('Speech recognition started successfully');
                } else if (response) {
                    console.error('Recognition start failed:', response.error);
                    isCapturing = false;
                }
            });
        }, 1000); // 等待content script完全加载
    } catch (error) {
        console.error('Failed to inject content script:', error);
        isCapturing = false;
    }
}

// 停止语音识别
async function stopRecognition() {
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

    currentTabId = null;
    console.log('Recognition stopped');
    }

        // STT音频识别函数
        async function recognizeAudioData(audioDataBase64, sampleRate, format) {
        try {
        console.log('=== STT Recognition Request ===');
        console.log('Audio data length (Base64):', audioDataBase64.length);
        console.log('Sample rate:', sampleRate, 'Hz');
        console.log('Format:', format);
        
        // 从Base64解码音频数据
        const audioBytes = Uint8Array.from(atob(audioDataBase64), c => c.charCodeAt(0));
        
        // 计算音频时长（近似）
        const audioDuration = (audioBytes.length / 2) / sampleRate; // 16位 = 2字节/样本
        console.log('Estimated audio duration:', audioDuration.toFixed(2), 'seconds');
        
        // 从storage获取API密钥
        const config = await new Promise((resolve) => {
            chrome.storage.local.get(['sttApiKey', 'sttApiUrl'], (result) => {
                resolve({
                    apiKey: result.sttApiKey || '',
                    apiUrl: result.sttApiUrl || 'https://speech.googleapis.com/v1/speech:recognize'
                });
            });
        });
        
        // 检查API密钥是否配置
        if (!config.apiKey || config.apiKey === '') {
            console.error('STT API key not configured. Please set it in the extension popup.');
            return '';
        }
        
        // 构建API URL
        const apiUrl = `${config.apiUrl}?key=${config.apiKey}`;
        console.log('Calling STT API:', apiUrl.replace(config.apiKey, '***'));
        
        // 调用Google Cloud Speech-to-Text API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: {
                    content: audioDataBase64 // Base64编码的音频数据
                },
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: sampleRate,
                    languageCode: 'zh-CN',
                    alternativeLanguageCodes: ['en-US'],
                    enableAutomaticPunctuation: true
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('STT API error:', response.status, errorText);
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('STT API response:', result);
        
        if (result.results && result.results.length > 0) {
            const transcript = result.results[0].alternatives[0].transcript;
            console.log('Recognized text:', transcript);
            return transcript;
        }
        
        return '';
    } catch (error) {
        console.error('Error in audio recognition:', error);
        return '';
    }
}

