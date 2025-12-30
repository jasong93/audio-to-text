// Content script for speech recognition
console.log('Content script loaded');
let recognition = null;
let isRecognizing = false;
let videoObserver = null;
let currentVideos = [];

// 监听页面中的video元素，同步播放/暂停状态
function setupVideoObserver() {
    // 查找所有video元素
    const videos = document.querySelectorAll('video');
    currentVideos = Array.from(videos);
    
    console.log('Found videos:', currentVideos.length);
    
    // 监听每个video的播放/暂停事件
    currentVideos.forEach((video, index) => {
        console.log(`Setting up listener for video ${index}`);
        
        const handlePlay = () => {
            console.log(`Video ${index} started playing`);
            if (!isRecognizing && recognition) {
                try {
                    recognition.start();
                    isRecognizing = true;
                    console.log('Recognition started (video playing)');
                } catch (e) {
                    console.error('Failed to start recognition:', e);
                }
            }
        };
        
        const handlePause = () => {
            console.log(`Video ${index} paused`);
            if (isRecognizing && recognition) {
                try {
                    recognition.stop();
                    isRecognizing = false;
                    console.log('Recognition stopped (video paused)');
                } catch (e) {
                    console.error('Failed to stop recognition:', e);
                }
            }
        };
        
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        
        // 如果视频已经在播放，启动识别
        if (!video.paused) {
            handlePlay();
        }
    });
    
    // 使用MutationObserver监听新添加的video元素
    if (videoObserver) {
        videoObserver.disconnect();
    }
    
    videoObserver = new MutationObserver((mutations) => {
        const newVideos = document.querySelectorAll('video');
        if (newVideos.length !== currentVideos.length) {
            console.log('New video elements detected, re-setting up observers');
            setupVideoObserver();
        }
    });
    
    videoObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

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
            console.log('Sending recognized text:', finalTranscript.trim());
            chrome.runtime.sendMessage({
                action: 'textUpdate',
                text: finalTranscript.trim()
            });
        }
    };
    
    // 错误处理
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            console.log('No speech detected, continuing...');
        } else if (event.error === 'audio-capture') {
            console.error('Microphone access denied or not available');
            alert('请允许麦克风权限以进行语音识别');
        } else if (event.error === 'not-allowed') {
            console.error('Microphone permission denied');
            alert('请允许麦克风权限以进行语音识别');
        }
    };
    
    // 识别结束事件
    recognition.onend = () => {
        isRecognizing = false;
        console.log('Recognition ended');
        
        // 检查是否有视频正在播放
        const playingVideos = currentVideos.filter(v => !v.paused);
        
        // 如果还在捕获状态且有视频在播放，自动重启识别
        chrome.runtime.sendMessage({ action: 'checkCaptureStatus' }, (response) => {
            if (response && response.isCapturing && playingVideos.length > 0) {
                try {
                    recognition.start();
                    isRecognizing = true;
                    console.log('Recognition restarted (video still playing)');
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
    console.log('Content script received message:', message.action);
    
    if (message.action === 'startRecognition') {
        console.log('Starting recognition...');
        
        // 设置视频监听器
        setupVideoObserver();
        
        if (!recognition) {
            recognition = initSpeechRecognition();
            if (!recognition) {
                sendResponse({ success: false, error: 'Speech recognition not supported' });
                return true;
            }
        }
        
        // 检查是否有视频正在播放
        const playingVideos = currentVideos.filter(v => !v.paused);
        
        if (recognition && !isRecognizing) {
            try {
                // 如果有视频在播放，立即启动识别；否则等待视频播放
                if (playingVideos.length > 0) {
                    recognition.start();
                    isRecognizing = true;
                    console.log('Recognition started (video is playing)');
                } else {
                    console.log('Waiting for video to play before starting recognition');
                }
                sendResponse({ success: true });
            } catch (e) {
                console.error('Failed to start recognition:', e);
                sendResponse({ success: false, error: e.message });
            }
        } else {
            console.log('Already recognizing');
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

