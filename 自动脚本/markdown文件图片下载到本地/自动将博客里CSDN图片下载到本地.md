
在重新整理博客的时候，发现以前的博客图片不显示了，经过排查发现是直接引用了 CSDN 博客里面的图片，然后 CSDN 设置了防盗链机制。所以我们需要将 CSDN 里面的图片自动下载下来。之后可以选择存在本地或者上传自己的图床。

因为我的博客用的 vitepress 模版，所以 config 里面的参数是 以 vitepress 模版为例子，替换成你自己的模版就行了。

### 完整实现步骤

#### 1. 创建图片处理脚本

在项目根目录创建 `download-csdn-images` 文件：

```javascript
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { URL } from 'url';

// 解决ES模块中__dirname的问题
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置参数
const config = {
  markdownDir: path.join(__dirname, 'docs'), // Markdown文件所在目录
  imageSaveDir: path.join(__dirname, '.vitepress/public/images/csdn'), // 图片保存目录
  csdnImageRegex: /https:\/\/img-blog\.csdnimg\.cn\/[^\s"\)]+/g // CSDN图片URL正则
};

// 创建目录（如果不存在）
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

// 下载单张图片
function downloadImage(url, savePath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://blog.csdn.net/'
      }
    };

    const file = fsSync.createWriteStream(savePath);
    
    https.get(options, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(savePath).catch(() => {}); // 删除空文件
        return reject(new Error(`请求失败: ${response.statusCode}`));
      }

      response.pipe(file);
      
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(savePath).catch(() => {});
      reject(err);
    });
  });
}

// 处理单个Markdown文件（只下载不替换）
async function processMarkdownFile(filePath) {
  try {
    // 读取文件内容
    const content = await fs.readFile(filePath, 'utf8');
    
    // 查找所有CSDN图片链接
    const imageUrls = [...new Set(content.match(config.csdnImageRegex) || [])];
    if (imageUrls.length === 0) return;

    console.log(`处理文件: ${filePath}，发现 ${imageUrls.length} 张CSDN图片`);
    
    // 只下载图片，不修改原文件
    for (const url of imageUrls) {
      try {
        // 提取文件名
        const urlObj = new URL(url);
        const fileName = path.basename(urlObj.pathname).split('?')[0];
        const savePath = path.join(config.imageSaveDir, fileName);
        
        // 检查文件是否已存在
        try {
          await fs.access(savePath);
          console.log(`图片已存在: ${fileName}`);
        } catch {
          // 下载图片
          console.log(`正在下载: ${url}`);
          await downloadImage(url, savePath);
          console.log(`下载成功: ${fileName}`);
        }
        
      } catch (err) {
        console.error(`处理图片失败 ${url}: ${err.message}`);
      }
    }
    
  } catch (err) {
    console.error(`处理文件失败 ${filePath}: ${err.message}`);
  }
}

// 遍历所有Markdown文件
async function downloadAllMarkdownFiles() {
  try {
    // 确保图片保存目录存在
    await ensureDirectoryExists(config.imageSaveDir);
    
    // 递归遍历目录
    async function traverseDir(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await traverseDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          await processMarkdownFile(fullPath);
        }
      }
    }
    
    await traverseDir(config.markdownDir);
    console.log('所有图片下载完成!');
    
  } catch (err) {
    console.error('处理过程出错:', err.message);
  }
}

// 启动处理
downloadAllMarkdownFiles();
    
```

#### 2. 运行命令

现在执行构建命令时，会自动处理所有 CSDN 图片：

```javascript
node download-csdn-images.js
```

### 实现原理

1. **图片检测**：脚本会扫描所有 Markdown 文件，通过正则表达式匹配 CSDN 图片链接
2. **本地存储**：所有下载的图片会保存在 `docs/public/csdn-images` 目录
3. **增量处理**：已下载的图片不会重复下载，提高构建效率
4. **防403策略**：通过模拟浏览器请求头（User-Agent 和 Referer）避免下载时出现403错误

这种方法的好处是完全可控，不依赖第三方插件的维护状态，并且可以根据需要自定义图片处理逻辑，比如扩展支持其他图片源或添加图片压缩功能。

之后还可以将图片上传到自己的图床上，将地址改成图床地址就可以了。

```javascript
// 配置参数 - 请根据你的实际情况修改
const config = {
  markdownDir: path.join(__dirname, 'docs'), // Markdown文件所在目录
  csdnImageRegex: /https:\/\/img-blog\.csdnimg\.cn\/[^\s"\)]+/g, // CSDN图片URL正则
  // 腾讯云OSS配置
  ossBaseUrl: 'https://your-bucket-name.cos.ap-beijing.myqcloud.com/images/csdn' // 你的OSS基础路径
};


// 处理单个Markdown文件
async function processMarkdownFile(filePath) {
  try {
    // 读取文件内容
    const content = await fs.readFile(filePath, 'utf8');
    
    // 查找所有CSDN图片链接
    const imageUrls = [...new Set(content.match(config.csdnImageRegex) || [])];
    if (imageUrls.length === 0) return;

    console.log(`处理文件: ${filePath}，发现 ${imageUrls.length} 张CSDN图片`);
    
    let newContent = content;
    
    // 替换每张图片的链接为OSS链接
    for (const url of imageUrls) {
      try {
        // 提取原图片文件名（保留CSDN的原始文件名）
        const urlObj = new URL(url);
        const fileName = path.basename(urlObj.pathname).split('?')[0];
        
        // 构建OSS链接
        const ossUrl = `${config.ossBaseUrl}/${fileName}`;
        
        // 替换链接
        newContent = newContent.replace(new RegExp(url, 'g'), ossUrl);
        console.log(`已替换: ${url} -> ${ossUrl}`);
        
      } catch (err) {
        console.error(`处理图片失败 ${url}: ${err.message}`);
      }
    }
    
    // 保存修改后的文件
    await fs.writeFile(filePath, newContent, 'utf8');
    console.log(`已更新文件: ${filePath}`);
    
  } catch (err) {
    console.error(`处理文件失败 ${filePath}: ${err.message}`);
  }
}


// 遍历所有Markdown文件
async function processAllMarkdownFiles() {
  try {
    // 递归遍历目录
    async function traverseDir(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await traverseDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          await processMarkdownFile(fullPath);
        }
      }
    }
    
    await traverseDir(config.markdownDir);
    console.log('所有文件链接替换完成!');
    
  } catch (err) {
    console.error('处理过程出错:', err.message);
  }
}
```
