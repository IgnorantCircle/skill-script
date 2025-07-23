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
    