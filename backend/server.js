require('dotenv').config(); 

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3001;


const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key-12345';

// ==========================================
// JA識別子(://の直後3文字)の解析ミドルウェア
// ==========================================
app.use((req, res, next) => {
  // フルURL、またはホスト名ヘッダーを取得
  // (テスト用に req.url や独自のヘッダー、あるいは host を柔軟に結合)
  const targetString = req.headers['x-original-url'] || req.headers.host || '';

  // 1. "://" が含まれる場合は、その直後の3桁数字を抽出
  // 2. "://" が含まれない場合は、先頭の3桁数字を抽出（フォールバック）
  let match = targetString.match(/:\/\/([0-9]{3})/);
  
  if (!match) {
    // プロトコル名（://）がついていないプレーンなホスト名だった場合の対応
    match = targetString.match(/^([0-9]{3})/);
  }

  if (match) {
    req.jaCode = match[1]; // 000~999の文字列が格納される
  } else {
    req.jaCode = null; // 識別子がない、または不正な場合
  }
  
  next();
});

// ==========================================
// 1. すべてのリクエストを監視 ＆ 生データ強制パース
// ==========================================
app.use((req, res, next) => {
  const requestId = Date.now();
  
  // 💡 Javaから届く生データを自前で結合してパースする
  let dataBuffer = '';
  req.on('data', chunk => {
    dataBuffer += chunk;
  });

  req.on('end', () => {
    // 届いた生データを req.body に強制格納
    if (dataBuffer) {
      try {
        req.body = JSON.parse(dataBuffer);
      } catch (e) {
        req.body = {}; // JSONじゃなければ空
      }
    } else {
      req.body = req.body || {};
    }

    // ログ送信 (JA識別子もモニタリング用に付与)
    io.emit('new_request', {
      id: requestId,
      side: 'left',
      method: req.method,
      path: req.path,
      jaCode: req.jaCode, // ログ画面でJAを識別できるように追加
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

    // 💡 データの吸い出しが「完了してから」次のルートへ進む
    next();
  });
});

// ==========================================
// 2. 各種 API エンドポイント (共通パス /api/v1 の定義)
// ==========================================
const apiRouter = express.Router();

// JA識別子を必須にする場合のガード用ミドルウェア (任意)
apiRouter.use((req, res, next) => {
  if (!req.jaCode) {
    return res.status(400).json({ status: 'error', message: 'Invalid or missing JA identifier sub-domain.' });
  }
  next();
});

// 各種エンドポイントを /api/v1 配下としてマッピング
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

// ルーターを /api/v1 に紐付け
app.use('/api/v1', apiRouter);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});