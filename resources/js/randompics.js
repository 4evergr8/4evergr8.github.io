function getRandomImage() {
    var totalImages = 52; // 假设有268张图片（001.jpg到268.jpg）
    var randomIndex = Math.floor(Math.random() * totalImages) + 1; // 随机获取索引
    var imagePath = '/resources/jpgs/' + randomIndex.toString().padStart(3, '0') + '.jpg'; // 使用 padStart 处理序号
    document.getElementById('randomImage').src = imagePath; // 设置图片源
}


// 在页面加载时调用函数
window.onload = async function() {
    getRandomImage()


};
