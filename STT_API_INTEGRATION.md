# STT API集成指南

## 当前实现

扩展已经实现了音频捕获和处理框架：
1. ✅ 捕获页面音频流
2. ✅ 使用AudioContext处理音频流
3. ✅ 转换为16位PCM格式
4. ✅ 定期发送音频数据到background
5. ⚠️ STT API调用（需要集成）

## 集成步骤

### 1. Google Cloud Speech-to-Text API

在 `background.js` 中的 `recognizeAudioData` 函数中添加以下代码：

```javascript
async function recognizeAudioData(audioDataBase64, sampleRate, format) {
    try {
        // 从Base64解码音频数据
        const audioBytes = Uint8Array.from(atob(audioDataBase64), c => c.charCodeAt(0));
        
        // 调用Google Cloud Speech-to-Text API
        const response = await fetch('https://speech.googleapis.com/v1/speech:recognize?key=YOUR_API_KEY', {
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

        const result = await response.json();
        if (result.results && result.results.length > 0) {
            return result.results[0].alternatives[0].transcript;
        }
        return '';
    } catch (error) {
        console.error('Error in audio recognition:', error);
        return '';
    }
}
```

**获取API密钥**：
1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目并启用Speech-to-Text API
3. 创建API密钥
4. 将 `YOUR_API_KEY` 替换为实际密钥

### 2. Azure Speech Services

```javascript
async function recognizeAudioData(audioDataBase64, sampleRate, format) {
    try {
        // 从Base64解码音频数据
        const audioBytes = Uint8Array.from(atob(audioDataBase64), c => c.charCodeAt(0));
        
        // 获取访问令牌（需要定期刷新）
        const tokenResponse = await fetch('https://YOUR_REGION.api.cognitive.microsoft.com/sts/v1.0/issueToken', {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': 'YOUR_SUBSCRIPTION_KEY'
            }
        });
        const token = await tokenResponse.text();
        
        // 调用语音识别API
        const response = await fetch(`https://YOUR_REGION.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'audio/wav; codec=audio/pcm; samplerate=16000'
            },
            body: audioBytes
        });

        const result = await response.json();
        if (result.RecognitionStatus === 'Success') {
            return result.DisplayText;
        }
        return '';
    } catch (error) {
        console.error('Error in audio recognition:', error);
        return '';
    }
}
```

### 3. Deepgram API

```javascript
async function recognizeAudioData(audioDataBase64, sampleRate, format) {
    try {
        // 从Base64解码音频数据
        const audioBytes = Uint8Array.from(atob(audioDataBase64), c => c.charCodeAt(0));
        
        const response = await fetch('https://api.deepgram.com/v1/listen?language=zh-CN&model=nova-2&smart_format=true', {
            method: 'POST',
            headers: {
                'Authorization': 'Token YOUR_DEEPGRAM_API_KEY',
                'Content-Type': 'audio/pcm'
            },
            body: audioBytes
        });

        const result = await response.json();
        if (result.results && result.results.channels && result.results.channels[0]) {
            return result.results.channels[0].alternatives[0].transcript;
        }
        return '';
    } catch (error) {
        console.error('Error in audio recognition:', error);
        return '';
    }
}
```

## 注意事项

1. **API密钥安全**：不要将API密钥硬编码在代码中，考虑使用Chrome Storage存储密钥
2. **配额限制**：注意API的调用配额和费用
3. **错误处理**：实现适当的错误处理和重试机制
4. **语言支持**：根据需要调整语言代码（zh-CN, en-US等）

## 测试

1. 集成API后，重新加载扩展
2. 打开包含视频的网页
3. 点击"Start Capture"
4. 播放视频
5. 查看textarea中是否显示识别结果

