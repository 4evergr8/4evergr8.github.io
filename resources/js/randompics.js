function getRandomImage() {
    var totalImages = 52; // 假设有268张图片（001.jpg到268.jpg）
    var randomIndex = Math.floor(Math.random() * totalImages) + 1; // 随机获取索引
    var imagePath = '/resources/jpgs/' + randomIndex.toString().padStart(3, '0') + '.jpg'; // 使用 padStart 处理序号
    document.getElementById('randomImage').src = imagePath; // 设置图片源
}
async function fetchRandomAdvice() {
    try {
        const response = await fetch('https://api.adviceslip.com/advice');
        if (!response.ok) {
            throw new Error('Abnormal');
        }
        const data = await response.json();
        const advice = data.slip.advice; // 建议内容

        document.querySelector('.quote').textContent = advice;

    } catch (error) {
        console.error('Fail:', error);
        document.querySelector('.quote').textContent = 'Failed to fetch';
    }
}










window.addEventListener('load', async function() {
    await getRandomImage();
    await fetchRandomAdvice();
});


