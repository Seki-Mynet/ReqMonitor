import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

// Socket.ioのインスタンス作成
const socket = io('http://localhost:3001');

// --- ヘルパーコンポーネント ---

// JSONを色分けして整形表示する関数
const renderJson = (json) => {
  const jsonString = JSON.stringify(json, null, 2);
  return jsonString.split('\n').map((line, i) => {
    const highlightedLine = line
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "(.*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (true|false|null|\d+)/g, ': <span class="json-value">$1</span>');

    return (
      <div key={i} style={{ textAlign: 'left' }}>
        <span dangerouslySetInnerHTML={{ __html: highlightedLine }} />
      </div>
    );
  });
};

// ラベル付きJSONセクション
const InfoSection = ({ title, data }) => {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div style={{ marginTop: '10px', textAlign: 'left' }}>
      <span style={{ fontSize: '0.7em', fontWeight: 'bold', color: '#999', textTransform: 'uppercase' }}>
        {title}
      </span>
      <div className="json-display">
        {renderJson(data)}
      </div>
    </div>
  );
};

// --- メインコンポーネント ---

function App() {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const newestRequestRef = useRef(null);

  // 1. Socket通信の管理
  useEffect(() => {
    socket.on('connect', () => setConnectionStatus('connected'));
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('disconnected'));

    socket.on('new_request', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('new_request');
    };
  }, []);

  // 2. 自動スクロール (新しいメッセージが来た時)
  useEffect(() => {
    if (newestRequestRef.current) {
      newestRequestRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [messages]);

  // 最新のリクエスト(左側)のインデックスを探す
  const lastRequestIndex = [...messages].reverse().findIndex(m => m.side !== 'right');
  const targetIndex = lastRequestIndex !== -1 ? (messages.length - 1 - lastRequestIndex) : -1;

  // 3. 履歴クリック時の手動スクロール
  const scrollToRequest = (id) => {
    // IDを確実に紐付けるため unit-ID を取得
    const element = document.getElementById(`unit-${id}`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  // 4. コピー＆ダウンロードハンドラー
  const getFormattedText = (msg) => {
    const isRes = msg.side === 'right';
    
    // 出力用オブジェクトの構築
    const output = isRes ? {
      type: "RESPONSE",
      status: msg.status,
      timestamp: msg.timestamp,
      headers: msg.headers || {}, // レスポンスヘッダーを追加
      body: msg.body
    } : {
      type: "REQUEST",
      method: msg.method,
      path: msg.path,
      timestamp: msg.timestamp,
      headers: msg.headers || {},
      query: msg.query || {},
      body: msg.body
    };

    return JSON.stringify(output, null, 2);
  };

  const handleCopy = (msg) => {
    const text = getFormattedText(msg);
    navigator.clipboard.writeText(text).then(() => {
      // 任意：コピー完了のフィードバック（アラートなど）
      console.log("Copied to clipboard");
    });
  };

  const handleDownload = (msg) => {
    const text = getFormattedText(msg);
    const typeLabel = msg.side === 'right' ? 'RES' : (msg.method || 'REQ');
    const pathName = msg.path ? msg.path.replace(/^\//, '').replace(/\//g, '-') : 'root';
    
    const now = new Date();
    const dateStr = now.getFullYear() + 
                  (now.getMonth() + 1).toString().padStart(2, '0') + 
                  now.getDate().toString().padStart(2, '0');
    const timeStr = now.getHours().toString().padStart(2, '0') + 
                  now.getMinutes().toString().padStart(2, '0') + 
                  now.getSeconds().toString().padStart(2, '0');

    const fileName = `${typeLabel}_${pathName}_${dateStr}-${timeStr}.json`;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 履歴用データ (最新が上)
  const requestHistory = [...messages]
    .filter(m => m.side !== 'right')
    .reverse();

  return (
    <div className="app-container">
      <header>
        <h2>🛰️ REQ MONITOR</h2>
        <div className={`live-badge ${connectionStatus}`}>
          <div className="live-dot"></div>
          {connectionStatus.toUpperCase()}
        </div>
        <title>REQ MONITOR</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛰️</text></svg>"></link>
      </header>

      <div className="main-layout">
        {/* --- App.jsx サイドバー部分 --- */}
        <aside className="sidebar">
          <div className="sidebar-header">HISTORY (NEWEST)</div>
          <div className="index-list">
            {requestHistory.map((req) => {
              const originalIndex = messages.filter(m => m.side !== 'right').indexOf(req) + 1;
              return (
                <div 
                  key={req.id} 
                  className="index-item clickable" 
                  data-method={req.method}
                  onClick={() => scrollToRequest(req.id)}
                >
                  <span className="index-number">#{originalIndex}</span>
                  <span className="index-method-badge">{req.method}</span>
                  <span className="index-path" title={req.path}>{req.path}</span>
                  <span className="index-time">{req.timestamp}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* メインチャット欄 */}
        <main className="content-area">
          <div className="balloon-container">
            {messages.map((msg, index) => {
              const isRight = msg.side === 'right';
              const isTargetUnit = index === targetIndex;

              return (
                <div 
                  key={msg.id} 
                  id={`unit-${msg.id}`} // ここにIDを付与してスクロールのターゲットにする
                  className="message-unit"
                  ref={isTargetUnit ? newestRequestRef : null}
                >
                  <div 
                    className={`balloon ${isRight ? 'right' : 'left'}`}
                    data-method={isRight ? 'RES' : msg.method}
                  >
                    <div className="balloon-header">
                      <strong className="method-label" data-method={isRight ? 'RES' : msg.method}>
                        <span className="path-text">
                          {isRight ? `STATUS: ${msg.status}` : msg.path}
                        </span>
                      </strong>
                      <div className="balloon-actions">
                        <button onClick={() => handleCopy(msg)} title="Copy JSON">📋</button>
                        <button onClick={() => handleDownload(msg)} title="Download JSON">💾</button>
                      </div>
                    </div>

                    <span className="timestamp">
                      {new Date().toLocaleDateString()} {msg.timestamp}
                    </span>

                    {isRight ? (
                      <>
                        {/* レスポンス側にも Headers を追加 */}
                        <InfoSection title="Response Headers" data={msg.headers} />
                        <InfoSection title="Response Body" data={msg.body} />
                      </>
                    ) : (
                      <>
                        <InfoSection title="Request Headers" data={msg.headers} />
                        <InfoSection title="Query Parameters" data={msg.query} />
                        <InfoSection title="Request Body" data={msg.body} />
                      </>
                    )}
                  </div>

                  {isRight && <div className="set-divider"></div>}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;