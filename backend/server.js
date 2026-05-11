// server.js (Express)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // 開発環境に合わせて調整
});

app.use(express.json());

// ここで ID を生成（リクエストとレスポンスを紐付けるための共通ID）
const currentRequestId = Date.now();

// すべてのリクエストを監視するミドルウェア
app.use((req, res, next) => {
  const requestId = Date.now();

  // 1. リクエストログ（左側）を即座に送信
  io.emit('new_request', {
    id: requestId,
    side: 'left',
    method: req.method,
    path: req.path,
    headers: req.headers,
    query: req.query,
    body: req.body || {},
    timestamp: new Date().toLocaleTimeString(),
  });

  // レスポンスデータを一時保存する変数
  let responsePayload = null;

  // ログ送信用の共通関数（ここを鉄壁にする）
  const emitResponseOnce = () => {
    // すでに送信済みフラグがあれば、絶対に何もしない
    if (res._hasEmittedLog) return;
    
    // まだデータがない場合はスキップ（finishイベントなどで呼ばれた時用）
    if (!responsePayload && res.statusCode < 400) return;

    io.emit('new_request', {
      id: requestId + "-res",
      side: 'right',
      status: res.statusCode,
      headers: res.getHeaders(),
      body: responsePayload || { message: "No body or non-JSON response" },
      timestamp: new Date().toLocaleTimeString(),
    });

    // フラグを立てて二度と通さないようにする
    res._hasEmittedLog = true;
  };

  // 全ての出口をフックするが、中では保存するだけ
  const patch = (methodName) => {
    const original = res[methodName];
    res[methodName] = function (data) {
      if (!responsePayload) responsePayload = data; // 最初に届いたデータを優先
      const result = original.apply(this, arguments);
      emitResponseOnce(); // 送信を試みる
      return result;
    };
  };

  patch('send');
  patch('json');

  // 万が一 send/json が呼ばれなかった時のためのバックアップ
  res.on('finish', emitResponseOnce);

  next();
});

// テスト用エンドポイント
app.post('/api/test', (req, res) => {
  res.send({ status: 'ok' });
});

// 既存の app.use(...) の後に追記
app.post('/api/get_token', (req, res) => {
  const { userId, password } = req.body;
  
  // 異常なリクエストのチェック (400 Bad Request) ---
  // userId または password が未定義、あるいは空文字の場合はリクエスト自体が不当とみなします
  if (!userId || !password) {
    return res.status(400).json({
      status: 400,
      error: 'Bad Request',
      message: 'The connection does not exist.',
      errorCode: 'inexistent_connection',
      attributes: '{ "error": "Expired token received for JSON Web Token validation"  }'
    });
  }

  // 認証チェック (401 Unauthorized) ---
  // 簡易的なユーザーチェック（本来はDBと照合します）
  if (userId === 'admin' && password === 'password123') {
    // 1. ペイロード（含めたいデータ）を作成
    const payload = {
      uid: userId,
      role: 'admin'
    };

    // 2. トークンを発行（有効期限 1時間）
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });

    // 3. トークンを返す
    return res.json({
      token: token
    });
  }

  // 認証失敗
  res.status(401).json({
    status: 401,
    error: 'Unauthorized',
    message: 'Authentication failed.',
    errorCode: 'inexistent_connection',
    attributes: '{ "error": "Expired token received for JSON Web Token validation"  }'
  });
});

// 認証ミドルウェア (既存のものを流用) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ');
    
  if (!token) return res.status(401).json({ 
    status: 401,
    error: 'Unauthorized',
    message: 'No token.',
    errorCode: 'inexistent_connection',
    attributes: '{ "error": "Expired token received for JSON Web Token validation"  }' 
  });

  jwt.verify(token[1], SECRET_KEY, (err, user) => {
    if (err) return res.status(401).json({ 
      status: 401,
      error: 'Unauthorized',
      message: 'Not Authorization.',
      errorCode: 'inexistent_connection',
      attributes: '{ "error": "Expired token received for JSON Web Token validation"  }' 
    });
    req.user = user;
    next();
  });
};

app.post('/api/update_product',authenticateToken, (req, res) => {
  res.send({ status: 'ok' });
});


server.listen(3001, () => console.log('Server running on port 3001'));