const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  const stat = file && fs.existsSync(file) ? fs.statSync(file) : null;
  if (!stat || !stat.isFile()) { res.writeHead(404); return res.end('not found'); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

  /* Range 请求：视频拖动进度条必需 */
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start >= stat.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); return res.end(); }
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 8080, '0.0.0.0', () => console.log('serving on port ' + (process.env.PORT || 8080)));
