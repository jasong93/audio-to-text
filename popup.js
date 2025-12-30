console.log('popup.js has initiallized');
// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 获取textarea元素
    const textArea = document.getElementById('text');
    if (!textArea) {
        console.error('Textarea element not found');
        return;
    }

    // 配置相关元素
    const apiKeyInput = document.getElementById('apiKey');
    const saveConfigBtn = document.getElementById('saveConfig');
    const configStatus = document.getElementById('configStatus');

    // 加载保存的API密钥
    chrome.storage.local.get(['sttApiKey'], (result) => {
        if (result.sttApiKey) {
            apiKeyInput.value = result.sttApiKey;
            configStatus.textContent = 'API key loaded';
            configStatus.className = 'status success';
        } else {
            configStatus.textContent = 'Please configure API key';
            configStatus.className = 'status error';
        }
    });

    // 保存配置
    saveConfigBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            configStatus.textContent = 'API key cannot be empty';
            configStatus.className = 'status error';
            return;
        }

        chrome.storage.local.set({ sttApiKey: apiKey }, () => {
            if (chrome.runtime.lastError) {
                configStatus.textContent = 'Failed to save: ' + chrome.runtime.lastError.message;
                configStatus.className = 'status error';
            } else {
                configStatus.textContent = 'API key saved successfully';
                configStatus.className = 'status success';
                console.log('API key saved');
            }
        });
    });

    // 存储音频流和处理器
    let audioStream = null;
    let audioProcessor = null;
    let audioDataBuffer = [];
    let recognitionInterval = null;

    // 开始捕获按钮
    document.getElementById('start').addEventListener('click', async () => {
        console.log('start captrueing');
        
        try {
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log("当前页面信息:",tab);
            if (!tab) {
                console.error('No active tab found');
                return;
            }

            const tabId = tab.id;
            console.log('Capturing audio from tab:', tabId);
            
            // 捕获页面音频流（必须在前台页面调用）
            chrome.tabCapture.capture({ audio: true }, async (stream) => {
                if (chrome.runtime.lastError) {
                    console.error('Capture error:', chrome.runtime.lastError.message);
                    alert('无法捕获音频流: ' + chrome.runtime.lastError.message);
                    return;
                }

                if (stream) {
                    console.log('Audio stream captured successfully');
                    audioStream = stream;
                    
                    // 加载audio-processor.js
                    const script = document.createElement('script');
                    script.src = 'audio-processor.js';
                    script.onload = async () => {
                        try {
                            // 创建音频处理器
                            audioProcessor = new AudioProcessor(stream, (audioData, sampleRate) => {
                                // 收集音频数据
                                audioDataBuffer.push(audioData);
                            });

                            // 启动音频处理
                            await audioProcessor.start();

                            // 定期发送音频数据进行识别（每2秒）
                            recognitionInterval = setInterval(() => {
                                if (audioDataBuffer.length > 0) {
                                    // 合并音频数据
                                    const totalLength = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0);
                                    console.log(`Processing audio buffer: ${audioDataBuffer.length} chunks, total samples: ${totalLength}`);
                                    
                                    const mergedData = new Int16Array(totalLength);
                                    let offset = 0;
                                    audioDataBuffer.forEach(arr => {
                                        mergedData.set(arr, offset);
                                        offset += arr.length;
                                    });

                                    // 转换为Base64发送到background
                                    const base64Audio = audioProcessor.int16ArrayToBase64(mergedData);
                                    console.log(`Sending audio data for recognition: ${base64Audio.length} bytes (Base64)`);
                                    
                                    // 发送音频数据进行识别
                                    chrome.runtime.sendMessage({
                                        action: 'recognizeAudio',
                                        audioData: base64Audio,
                                        sampleRate: 16000,
                                        format: 'pcm'
                                    }, (response) => {
                                        if (chrome.runtime.lastError) {
                                            console.error('Error sending audio data:', chrome.runtime.lastError.message);
                                        } else {
                                            console.log('Audio data sent successfully, waiting for recognition result...');
                                        }
                                    });

                                    // 清空缓冲区
                                    audioDataBuffer = [];
                                } else {
                                    console.log('No audio data in buffer yet...');
                                }
                            }, 2000); // 每2秒发送一次

                            // 通知background开始处理
                            chrome.runtime.sendMessage({ 
                                action: 'audioStreamCaptured',
                                tabId: tabId
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error('Error sending message:', chrome.runtime.lastError.message);
                                } else if (response && response.success) {
                                    console.log('Audio capture and processing started successfully');
                                } else {
                                    console.error('Failed to start capture');
                                }
                            });
                        } catch (error) {
                            console.error('Error starting audio processor:', error);
                            alert('无法启动音频处理: ' + error.message);
                        }
                    };
                    document.head.appendChild(script);
                } else {
                    console.error('Failed to capture audio stream');
                    alert('无法捕获音频流，请确保页面正在播放音频');
                }
            });
        } catch (error) {
            console.error('Error starting capture:', error);
        }
    });


       // 监听来自background的消息，接收识别后的文本
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'textUpdate' && message.text) {
            console.log('Received text update:', message.text);
            // 增量添加文本到textarea
            const currentText = textArea.value;
            // 如果当前有文本，添加空格分隔；否则直接添加
            textArea.value = currentText ? currentText + message.text : message.text;
            // 自动滚动到底部
            textArea.scrollTop = textArea.scrollHeight;
        }
        return true;
    });


    // 停止捕获按钮
    document.getElementById('stop').addEventListener('click', () => {
        // 停止音频处理器
        if (audioProcessor) {
            audioProcessor.stop();
            audioProcessor = null;
        }

        // 停止定期识别
        if (recognitionInterval) {
            clearInterval(recognitionInterval);
            recognitionInterval = null;
        }

        // 清空缓冲区
        audioDataBuffer = [];

        // 停止音频流
        if (audioStream) {
            const tracks = audioStream.getTracks();
            tracks.forEach(track => track.stop());
            audioStream = null;
        }
        
        chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
            } else if (response && response.success) {
                console.log('Capture stopped');
            } else {
                console.error('Failed to stop capture');
            }
        });
    });
});