chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed111");
});

chrome.action.onClicked.addListener((tab) => {
    chrome.tabCapture.capture({ audio: true }, (stream) => {
        if (stream) {
            console.log("stream");
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(1024, 1, 1);

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (event) => {
                const audioData = event.inputBuffer.getChannelData(0);
                // Process audio data here
                console.log(audioData);
            };
        } else {
            console.error("Failed to capture audio");
        }
    });
});