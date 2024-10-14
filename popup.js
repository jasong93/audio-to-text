document.getElementById('start').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startCapture' });
});

document.getElementById('stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopCapture' });
});