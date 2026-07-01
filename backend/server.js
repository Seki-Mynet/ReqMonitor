require('dotenv').config(); 

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key-12345';

// 保存先ディレクトリのパス設定と作成
const UPLOAD_DIR = path.join(__dirname, 'backend', 'images');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// フロントから画像へアクセスできるように静的ファイルとして公開
app.use('/images', express.static(UPLOAD_DIR));

// ディスク保存用の設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// ==========================================
// JA識別子(://の直後3文字)の解析ミドルウェア
// ==========================================
app.use((req, res, next) => {
  const targetString = req.headers['x-original-url'] || req.headers.host || '';
  let match = targetString.match(/:\/\/([0-9]{3})/);
  
  if (!match) {
    match = targetString.match(/^([0-9]{3})/);
  }

  if (match) {
    req.jaCode = match[1];
  } else {
    req.jaCode = null;
  }
  
  next();
});

// ==========================================
// 1. すべてのリクエストを監視 ＆ 生データパース
// ==========================================
app.use((req, res, next) => {
  const requestId = Date.now();
  
  // ★修正：toLowerCase() を追加して、大文字・小文字どちらで届いても確実にキャッチする
  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.toLowerCase().includes('multipart/form-data');

  // マルチパート（画像アップロード）の時
  if (isMultipart) {
    const emitResponseOnce = () => {
      if (res._hasEmittedLog) return;
      io.emit('new_request', {
        id: requestId + "-res",
        side: 'right',
        status: res.statusCode,
        headers: res.getHeaders(),
        body: { message: `Multipart response processed with status ${res.statusCode}` },
        timestamp: new Date().toLocaleTimeString(),
      });
      res._hasEmittedLog = true;
    };

    const originalSend = res.send;
    res.send = function (body) {
      const result = originalSend.apply(this, arguments);
      emitResponseOnce();
      return result;
    };
    res.on('finish', emitResponseOnce);

    return next(); // これで確実にすり抜けず、下の /uploadproductimages エンドポイントへ進みます
  }

  // 通常のJSONリクエスト時の処理（変更なし）
  let dataBuffer = '';
  req.on('data', chunk => {
    dataBuffer += chunk;
  });

  req.on('end', () => {
    if (dataBuffer) {
      try {
        req.body = JSON.parse(dataBuffer);
      } catch (e) {
        req.body = {};
      }
    } else {
      req.body = req.body || {};
    }

    io.emit('new_request', {
      id: requestId,
      side: 'left',
      method: req.method,
      path: req.path,
      jaCode: req.jaCode,
      headers: req.headers,
      query: req.query,
      body: req.body, 
      timestamp: new Date().toLocaleTimeString(),
    });

    let responsePayload = null;
    const emitResponseOnce = () => {
      if (res._hasEmittedLog) return;
      let formattedBody = responsePayload;
      if (typeof responsePayload === 'string') {
        try { formattedBody = JSON.parse(responsePayload); } catch (e) {}
      }
      io.emit('new_request', {
        id: requestId + "-res",
        side: 'right',
        status: res.statusCode,
        headers: res.getHeaders(),
        body: formattedBody || { message: "No body or non-JSON response" },
        timestamp: new Date().toLocaleTimeString(),
      });
      res._hasEmittedLog = true;
    };

    const originalSend = res.send;
    res.send = function (body) {
      if (!responsePayload) responsePayload = body;
      const result = originalSend.apply(this, arguments);
      emitResponseOnce();
      return result;
    };

    res.on('finish', emitResponseOnce);
    next();
  });
});

// ==========================================
// 2. 各種 API エンドポイント
// ==========================================
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  if (!req.jaCode) {
    return res.status(400).json({ status: 'error', message: 'Invalid or missing JA identifier sub-domain.' });
  }
  next();
});

// トークン検証用ミドルウェア
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const parts = authHeader && authHeader.split(' ');
    
  if (!parts || parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ 
      status: 401,
      error: 'Unauthorized',
      message: 'No token or invalid format.',
      errorCode: 'inexistent_connection',
      attributes: JSON.stringify({ error: "Invalid token format received" })
    });
  }

  const token = parts[1];
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(401).json({ 
        status: 401,
        error: 'Unauthorized',
        message: 'Not Authorization.',
        errorCode: 'inexistent_connection',
        attributes: JSON.stringify({ error: "Expired or invalid token" })
      });
    }
    req.user = user;
    next();
  });
};

// ------------------------------------------
// 商品画像アップロードエンドポイント（完全にパースされたデータを送る版）
// ------------------------------------------
apiRouter.post('/uploadproductimages', authenticateToken, upload.array('images[]', 500), (req, res) => {
  const fileNames = req.files ? req.files.map(file => file.originalname) : [];
  
  // フロントエンドから画像に直接アクセスできるようにフルURLの配列を生成
  const baseUrl = `${req.protocol}://${req.get('host')}`; 
  const imageUrls = req.files ? req.files.map(file => `${baseUrl}/images/${file.filename}`) : [];

  // multer を通過して、完全に解析し終わったデータをここで組み立てて画面へ送る
  const formattedBody = {
    info: "Multipart Form Data パース完了",
    uploaded_files_count: req.files ? req.files.length : 0,
    files: req.files ? req.files.map(file => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: `${(file.size / 1024).toFixed(2)} KB`
    })) : [],
    text_parameters: req.body || {} 
  };

  // ここで正式に左側の吹き出し用ログ（new_request）を発行
  io.emit('new_request', {
    id: Date.now(),
    side: 'left',
    method: req.method,
    path: req.path,
    jaCode: req.jaCode,
    headers: req.headers,
    query: req.query,
    body: formattedBody, // これでフロントエンドにオブジェクトとして渡る
    images: imageUrls, 
    timestamp: new Date().toLocaleTimeString(),
  });
  
  res.json({
    message: fileNames
  });
});

// 既存のエンドポイント
apiRouter.post('/test', (req, res) => {
  res.json({ status: 'ok' });
});

apiRouter.post('/get_token', (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({
      status: 400,
      error: 'Bad Request',
      message: 'The connection does not exist.',
      errorCode: 'inexistent_connection',
      attributes: JSON.stringify({ error: "Expired token received for JSON Web Token validation" })
    });
  }

  if (userId === 'admin' && password === 'password123') {
    const payload = { uid: userId, role: 'admin', jaCode: req.jaCode };
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });
    return res.json({ token: token });
  }

  res.status(401).json({
    status: 401,
    error: 'Unauthorized',
    message: 'Authentication failed.',
    errorCode: 'inexistent_connection',
    attributes: JSON.stringify({ error: "Expired token received for JSON Web Token validation" })
  });
});

apiRouter.post('/update_product', authenticateToken, (req, res) => {
    const products = req.body.products;
    if (products && Array.isArray(products)) {
        const productCodes = products.map(p => p.product_code);
        console.log(`[JA: ${req.jaCode}] Processing product codes:`, productCodes);
        res.json({ status: 'ok', message: productCodes });
    } else {
        res.status(400).json({ status: 'error', message: '商品データが正しく送信されませんでした' });
    }
});

app.use('/api/v1', apiRouter);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});