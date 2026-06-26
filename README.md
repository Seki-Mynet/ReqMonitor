# 🛰️ REQ MONITOR (リクエストモニター)

本システムは、特定の識別子（URLの `://` の直後3文字）を持つ HTTP リクエストおよびレスポンスをリアルタイムに監視・可視化するための開発・検証用デバッグツールです。JWT 認証を用いた API 検証が可能です。

---

## ⚙️ 環境設定 (.env)

バックエンド（サーバー）の動作設定を行うため、起動前に `backend/.env` ファイルを作成して以下の項目を設定してください。

```ini
# サーバーの起動ポート番号（未設定の場合は 3001 が使用されます）
PORT=3001

# JWT（JSON Web Token）の署名・検証に使用する秘密鍵
# 未設定の場合はデフォルト値（'your-secret-key-12345'）が使用されます
SECRET_KEY=your-secret-key-12345
```

---

## 🛠️ 初回セットアップ

プロジェクトを初めて利用する際は、以下の手順でそれぞれのディレクトリに移動し、依存パッケージをインストールしてください。

### 1. バックエンドのセットアップ
ルートディレクトリから `backend` ディレクトリへ移動し、パッケージをインストールします。
```bash
cd backend
npm install
```

### 2. フロントエンドのセットアップ
ルートディレクトリから `frontend` ディレクトリへ移動し、パッケージをインストールします。
```bash
cd frontend
npm install
```

---

## 🚀 起動方法

セットアップ完了後、以下の手順でそれぞれのサーバーを起動します。

### 1. バックエンド (サーバー) の起動
1. `backend` ディレクトリへ移動します。
   ```bash
   cd backend
   ```
2. 開発用サーバー（`nodemon` による自動再起動あり）を起動します。`.env` で指定したポート番号（デフォルト: `3001`）で待機します。
   ```bash
   npm run dev
   ```
   > 💡 `server.js` をエントリーポイントとして起動する場合は `npm run sv` を実行してください。

### 2. フロントエンド (クライアント) の起動
1. `frontend` ディレクトリへ移動します。
   ```bash
   cd frontend
   ```
2. Vite 開発用サーバーを起動します。
   ```bash
   npm run dev
   ```
3. 起動後、ブラウザで表示された URL（例: `http://localhost:5173`）にアクセスします。

---

## 🛠️ 主な機能説明

### 1. リアルタイム・ログ・モニタリング
Socket.io を用いて、サーバーが受信したリクエスト（画面左側）と、返却したレスポンス（画面右側）をリアルタイムにタイムラインへ描画します。新しいログが届くと画面が自動でスムーズにスクロールします。

### 2. 識別子（:// 直後の3文字）の自動解析
リクエストの `X-Original-URL` ヘッダーや `Host` ヘッダーから、`://` の直後にある3桁の識別コード（例: `http://001-shizai...` から `001`）をミドルウェアで自動抽出します。この識別子がない、または不正なリクエストは一括でブロック（`400 Bad Request`）するセキュリティガードを備えています。

### 3. ログのユーティリティ（コピー＆各種形式でのDL）
画面上のボタンから、以下の操作がワンクリックで行えます。
* **📋 ボタン**: 綺麗に整形されたデータをクリップボードにコピー
* **💾 ボタン**: 送信メソッドやパス、現在時刻を含んだファイル名を自動生成し、**JSON 形式**、または **Markdown 形式** でローカルにダウンロード

---

## 📡 提供 API エンドポイント (`/api/v1`)

> ⚠️ **共通の注意事項**
> 全てのエンドポイントは、リクエストから正しい識別子（3桁の数字）が解析されなかった場合、一律で以下の **`400 Bad Request`** を返却します。
> ```json
> {
>   "status": "error",
>   "message": "Invalid or missing JA identifier sub-domain."
> }
> ```

### 1. 疎通確認用テスト (`/test`)
サーバーが正常に稼働しているかを確認するための軽量なエンドポイントです。

- **メソッド**: `POST`
- **認証**: 不要
- **リクエストパラメータ**: なし（Body空欄で可）
- **期待できる戻り値 (`200 OK`)**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### 2. トークン発行 (`/get_token`)
認証が必要な API へアクセスするための JWT トークンを発行します。

- **メソッド**: `POST`
- **認証**: 不要
- **リクエストパラメータ (JSON / urlencoded)**:
  | パラメータ名 | 型 | 必須 | 説明 |
  | :--- | :--- | :--- | :--- |
  | `userId` | `string` | ✅ | ログインユーザーID（検証用固定値: `admin`） |
  | `password` | `string` | ✅ | パスワード（検証用固定値: `password123`） |

- **期待できる戻り値**:
  - **認証成功時 (`200 OK`)**:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
    > ※トークンのペイロードには `uid`, `role`, および解析された `jaCode` が含まれ、有効期限は1時間です。
  - **認証失敗時 (`401 Unauthorized`)**:
    ```json
    {
      "status": 401,
      "error": "Unauthorized",
      "message": "Authentication failed.",
      "errorCode": "inexistent_connection",
      "attributes": "{\"error\":\"Expired token received for JSON Web Token validation\"}"
    }
    ```
  - **パラメータ不足時 (`400 Bad Request`)**:
    ```json
    {
      "status": 400,
      "error": "Bad Request",
      "message": "The connection does not exist.",
      "errorCode": "inexistent_connection",
      "attributes": "{\"error\":\"Expired token received for JSON Web Token validation\"}"
    }
    ```

---

### 3. 商品データ更新 (`/update_product`)
送信された商品データ（商品コード一覧）を受け取り、正常に処理されたかを確認します。

- **メソッド**: `POST`
- **認証**: **必要**（HTTP ヘッダーに以下を指定）
  ```http
  Authorization: Bearer <get_tokenで取得したJWTトークン>
  ```
- **リクエストパラメータ (JSON)**:
  | パラメータ名 | 型 | 必須 | 説明 |
  | :--- | :--- | :--- | :--- |
  | `products` | `array` | ✅ | 商品オブジェクトの配列 |
  | `products[].product_code` | `string` | ✅ | 各商品の識別コード |

  *リクエストBodyの例:*
  ```json
  {
    "products": [
      { "product_code": "P-001", "name": "肥料A" },
      { "product_code": "P-002", "name": "資材B" }
    ]
  }
  ```

- **期待できる戻り値**:
  - **処理成功時 (`200 OK`)**:
    抽出された商品コードの配列と、リクエストから解析された `jaCode` が返却されます。
    ```json
    {
      "status": "ok",
      "message": ["P-001", "P-002"],
      "jaCode": "001"
    }
    ```
  - **データ不正時 (`400 Bad Request`)**:
    `products` 配列が送信されていない、または配列形式ではない場合に返却されます。
    ```json
    {
      "status": "error",
      "message": "商品データが正しく送信されませんでした"
    }
    ```
  - **トークン未付与・無効時 (`401 Unauthorized`)**:
    ヘッダーの形式が正しくない、またはトークンの期限切れ・不正な場合に返却されます。
    ```json
    {
      "status": 401,
      "error": "Unauthorized",
      "message": "Not Authorization.",
      "errorCode": "inexistent_connection",
      "attributes": "{\"error\":\"Expired or invalid token\"}"
    }
    ```

---

## 📦 デプロイ・設定のポイント

* **CORS設定**: 現在バックエンドの Socket.io は `origin: "*"`（すべて許可）に設定されています。本番環境や共有の検証環境へデプロイする際は、セキュリティのため許可するフロントエンドのドメインを明示的に指定してください。