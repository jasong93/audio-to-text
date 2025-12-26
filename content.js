// Content script for speech recognition
let recognition = null;
let isRecognizing = false;

// 初始化语音识别
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech recognition not supported');
        return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    // 设置识别语言：支持中文、英文
    recognition.lang = 'zh-CN,en-US';
    
    // 连续识别模式
    recognition.continuous = true;
    
    // 返回临时结果
    recognition.interimResults = true;
    
    // 识别结果事件
    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // 发送识别结果到background
        if (finalTranscript.trim()) {
            chrome.runtime.sendMessage({
                action: 'textUpdate',
                text: finalTranscript.trim()
            });
        }
    };
    
    // 错误处理
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
            // 可以尝试重新启动
        }
    };
    
    // 识别结束事件
    recognition.onend = () => {
        isRecognizing = false;
        // 如果还在捕获状态，自动重启识别
        chrome.runtime.sendMessage({ action: 'checkCaptureStatus' }, (response) => {
            if (response && response.isCapturing) {
                try {
                    recognition.start();
                    isRecognizing = true;
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                }
            }
        });
    };
    
    return recognition;
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startRecognition') {
        if (!recognition) {
            recognition = initSpeechRecognition();
        }
        
        if (recognition && !isRecognizing) {
            try {
                recognition.start();
                isRecognizing = true;
                sendResponse({ success: true });
            } catch (e) {
                console.error('Failed to start recognition:', e);
                sendResponse({ success: false, error: e.message });
            }
        } else {
            sendResponse({ success: false, error: 'Already recognizing' });
        }
        return true; // 保持消息通道开放
    }
    
    if (message.action === 'stopRecognition') {
        if (recognition && isRecognizing) {
            recognition.stop();
            isRecognizing = false;
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Not recognizing' });
        }
        return true;
    }
    
    if (message.action === 'checkStatus') {
        sendResponse({ isRecognizing });
        return true;
    }
});

