// 测试在 file:// 协议下 SVG 加载
console.log('🧪 测试 SVG 加载...');

const testUrls = [
  'images/avatars/default.svg',
  'file:///E:/Html-work/images/avatars/default.svg',
  './images/avatars/default.svg'
];

testUrls.forEach(url => {
  const img = new Image();
  img.onload = () => console.log(`✅ 成功: ${url}`);
  img.onerror = () => console.log(`❌ 失败: ${url}`);
  img.src = url;
});
