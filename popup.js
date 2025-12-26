// 获取textarea元素
const textArea = document.getElementById('text');

// 监听来自background的消息，接收识别后的文本
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'textUpdate' && message.text) {
        // 增量添加文本到textarea
        const currentText = textArea.value;
        // 如果当前有文本，添加空格分隔；否则直接添加
        textArea.value = currentText ? currentText + ' ' + message.text : message.text;
        // 自动滚动到底部
        textArea.scrollTop = textArea.scrollHeight;
    }
});

// 开始捕获按钮
document.getElementById('start').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startCapture' }, (response) => {
        if (response && response.success) {
            console.log('Capture started');
        } else {
            console.error('Failed to start capture');
        }
    });
});

// 停止捕获按钮
document.getElementById('stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
        if (response && response.success) {
            console.log('Capture stopped');
        } else {
            console.error('Failed to stop capture');
        }
    });
});