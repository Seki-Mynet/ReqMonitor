# 🛰️ REQ MONITOR (リクエストモニター)

本システムは、特定の識別子（URLの :// の直後3文字）を持つ HTTP リクエストおよびレスポンスをリアルタイムに監視・可視化するための開発・検証用デバッグツールです。JWT 認証を用いた API 検証が可能です。

---

## ⚙️ 環境設定 (.env)

起動前にそれぞれのディレクトリに .env ファイルを作成して以下の項目を設定してください。

### 1. バックエンドの設定 (backend/.env)
PORT=5000
SECRET_KEY=your-secret-key-12345

### 2. フロントエンドの設定 (frontend/.env)
Viteはブラウザ上で実行されるため、外部からアクセスする場合は localhost ではなく実際のサーバーIPアドレスを明示する必要があります。
VITE_API_URL=http://185.38.11.210:5000

---

## 🛠️ 初回セットアップ

Windows Server上で初めて利用する際は、コマンドプロンプト等で以下の手順に従い、それぞれのディレクトリに移動して依存パッケージをインストールしてください。

### 1. バックエンドのセットアップ
cd backend
npm install

### 2. フロントエンドのセットアップ
cd frontend
npm install

---

## 🪟 Windows Server環境での運用・起動手順

Windows Server環境では、プロセスの永続化およびバックグラウンド管理のために PM2 を使用して運用します。

### 1. 起動手順
コマンドプロンプトまたはPowerShellを開き、以下のコマンドを実行します。

* バックエンドの起動:
cd backend
pm2 start server.js --name "reqmoni-backend"

* フロントエンドの起動:
Windows環境におけるPM2の挙動を安定させるため、--cwd オプション（絶対パス指定）を用いてVite開発用サーバーを外部アクセス（--host）許可状態で起動します。
cd frontend
pm2 start npm --name "reqmoni-frontend" --cwd "C:\Program Files\nodeApp\reqmonitor\frontend" -- run dev --host 0.0.0.0

### 2. プロセス状態の保存・自動起動
双方のステータスが online になったことを確認したら、Windows Serverの再起動時に自動復旧できるよう状態を保存します。
pm2 save
pm2 list

### 3. 変更時のクリーン再起動手順
環境変数（.env）の変更やコード修正を確実にブラウザへ反映させるため、一度プロセスを delete してから立ち上げ直すことを強く推奨します。

* バックエンドの変更反映:
pm2 delete reqmoni-backend
cd backend
pm2 start server.js --name "reqmoni-backend"
pm2 save

* フロントエンドの変更反映:
pm2 delete reqmoni-frontend
pm2 start npm --name "reqmoni-frontend" --cwd "C:\Program Files\nodeApp\reqmonitor\frontend" -- run dev --host 0.0.0.0
pm2 save

---

## 🔄 運用トラブルシューティング

### ログの確認
システムエラーや接続状況を確認したい場合はPM2のログを展開します。
pm2 logs reqmoni-backend --lines 30
pm2 logs reqmoni-frontend --lines 30

⚠️ ブラウザキャッシュの注意点
フロントエンドの接続先IPやポートを変更した際、外部PCのブラウザに古い通信キャッシュが残ることがあります。変更が反映されない場合は、対象のブラウザで Ctrl + F5 を押してハードリフレッシュを行ってください。

---

## 🛠️ 主な機能説明

### 1. リアルタイム・ログ・モニタリング
Socket.io を用いて、サーバーが受信したリクエスト（画面左側）と、返却したレスポンス（画面右側）をリアルタイムにタイムラインへ描画します。新しいログが届くと画面が自動でスムーズにスクロールします。

### 2. 識別子（:// 直後の3文字）の自動解析
リクエストの X-Original-URL ヘッダーや Host ヘッダーから、:// の直後にある3桁の識別コード（例: http://001-shizai... から 001）をミドルウェアで自動抽出します。この識別子がない、または不正なリクエストは一括でブロック（400 Bad Request）するセキュリティガードを備えています。

### 3. ログのユーティリティ（コピー＆各種形式でのDL）
画面上のボタンから、以下の操作がワンクリックで行えます。
* 📋 ボタン: 綺麗に整形されたデータをクリップボードにコピー
* 💾 ボタン: 送信メソッドやパス、現在時刻を含んだファイル名を自動生成し、JSON 形式、または Markdown 形式 でローカルにダウンロード

---

## 📡 提供 API エンドポイント (/api/v1)

⚠️ 共通の注意事項
全てのエンドポイントは、リクエストから正しい識別子（3桁の数字）が解析されなかった場合、一律で以下の 400 Bad Request を返却します。
{
  "status": "error",
  "message": "Invalid or missing JA identifier sub-domain."
}

### 1. 疎通確認用テスト (/test)
サーバーが正常に稼働しているかを確認するための軽量なエンドポイントです。
- メソッド: POST
- 認証: 不要
- 期待できる戻り値 (200 OK):
{
  "status": "ok"
}

---

### 2. トークン発行 (/get_token)
認証が必要な API へアクセスするための JWT トークンを発行します。
- メソッド: POST
- 認証: 不要

- リクエストパラメータ (JSON / urlencoded):
| パラメータ名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| userId | string | ✅ | ログインユーザーID（検証用固定値: admin） |
| password | string | ✅ | パスワード（検証用固定値: password123） |

- 期待できる戻り値:
  * 認証成功時 (200 OK):
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  * 認証失敗時 (401 Unauthorized):
  {
    "status": 401,
    "error": "Unauthorized",
    "message": "Authentication failed.",
    "errorCode": "inexistent_connection",
    "attributes": "{\"error\":\"Expired token received for JSON Web Token validation\"}"
  }

---

### 3. 商品データ更新 (/update_product)
送信された商品データ（商品コード一覧）を受け取り、正常に処理されたかを確認します。
- メソッド: POST
- 認証: 必要（HTTP ヘッダーに以下を指定）
  Authorization: Bearer <get_tokenで取得したJWTトークン>

- リクエストパラメータ (JSON):
| パラメータ名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| products | array | ✅ | 商品オブジェクトの配列 |
| products[].product_code | string | ✅ | 各商品の識別コード |

- 期待できる戻り値:
  * 処理成功時 (200 OK):
  {
    "status": "ok",
    "message": ["P-001", "P-002"],
    "jaCode": "001"
  }

---

## 📦 デプロイ・設定のポイント

* CORS設定: 現在バックエンドの Socket.io は origin: "*"（すべて許可）に設定されています。本番環境や共有の検証環境へデプロイする際は、セキュリティのため許可するフロントエンドのドメインを明示的に指定してください。