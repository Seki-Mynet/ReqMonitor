// backend/index.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const path = require('path');
const jwt = require('jsonwebtoken');

// from .env
const PORT = process.env.PORT || 5000
const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key-12345';

// 保存先のストレージ設定 ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // 画像を保存するフォルダ（あらかじめ作成しておく）
  },
  filename: (req, file, cb) => {
    // ファイル名の重複を避けるため、タイムスタンプを付与
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
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

const upload = multer({ storage: storage });

// --- 3. 画像アップロードエンドポイント ---
// images[] というキー名で複数ファイルを受け取る設定
app.post('/api/product_images', authenticateToken, upload.array('images[]'), (req, res) => {
  
  // 異常なリクエスト（ファイルが1つも送られていない場合）のチェック
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: '画像ファイルが添付されていません。'
    });
  }

  // 保存されたファイル名のリストを作成
  const fileNames = req.files.map(file => file.filename);

  // 成功レスポンス
  res.json({
    success: true,
    file_names: fileNames
  });
});

// サーバー起動
app.use(cors());
app.use(express.json());



/**
 * テスト用 hello world
 */
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

/**
 * listen
 */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
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