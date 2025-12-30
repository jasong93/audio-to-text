// Audio processor for converting MediaStream to audio data
class AudioProcessor {
    constructor(stream, onAudioData) {
        this.stream = stream;
        this.onAudioData = onAudioData;
        this.audioContext = null;
        this.source = null;
        this.processor = null;
        this.isProcessing = false;
    }

    async start() {
        try {
            // 创建AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000 // 16kHz是语音识别的标准采样率
            });

            // 创建音频源
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // 创建ScriptProcessorNode处理音频数据
            // 注意：ScriptProcessorNode已废弃，但为了兼容性暂时使用
            // 更好的方案是使用AudioWorkletNode（需要额外的worklet文件）
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            // 处理音频数据
            this.processor.onaudioprocess = (event) => {
                if (!this.isProcessing) return;

                const inputData = event.inputBuffer.getChannelData(0);
                
                // 转换为16位PCM格式
                const pcmData = this.floatTo16BitPCM(inputData);
                5
                // 调用回调函数处理音频数据
                if (this.onAudioData) {
                    this.onAudioData(pcmData, this.audioContext.sampleRate);
                }
            };

            // 连接音频节点
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.isProcessing = true;
            console.log('Audio processing started');
        } catch (error) {
            console.error('Error starting audio processing:', error);
            throw error;
        }
    }

    stop() {
        this.isProcessing = false;

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        console.log('Audio processing stopped');
    }

    // 将Float32Array转换为16位PCM格式
    floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;

        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Int16Array(buffer);
    }

    // 将Int16Array转换为Base64编码（用于传输）
    int16ArrayToBase64(int16Array) {
        const bytes = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

