import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io(import.meta.env.VITE_API_URL);

// --- ヘルパーコンポーネント ---

// どんなデータ型が来ても安全に色付けして整形表示する関数
const renderJson = (json) => {
  // もしオブジェクトではなく単なる文字列が送られてきた場合は、JSON化せずにそのままテキストとして扱う
  let jsonString = "";
  if (typeof json === 'object' && json !== null) {
    jsonString = JSON.stringify(json, null, 2);
  } else {
    jsonString = String(json);
  }

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

// 文字列・オブジェクト両対応の安全な情報セクション
const InfoSection = ({ title, data }) => {
  // データの存在チェックを安全に行う
  if (data === undefined || data === null || data === '') return null;
  
  // オブジェクト型の場合のみ中身が空かチェック
  if (typeof data === 'object' && Object.keys(data).length === 0) return null;

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

socket.on('new_request', (data) => {
      console.log("★Socketから届いた生データ:", data); // ← これを1行追加してテスト送信する
      setMessages((prev) => [...prev, data]);
    });

// ★ 新設：画像プレビュー用のセクション
const ImagePreviewSection = ({ title, urls }) => {
  if (!urls || urls.length === 0) return null;
  return (
    <div style={{ marginTop: '10px', textAlign: 'left' }}>
      <span style={{ fontSize: '0.7em', fontWeight: 'bold', color: '#999', textTransform: 'uppercase' }}>
        {title} ({urls.length}件)
      </span>
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '10px', 
        marginTop: '5px',
        padding: '10px',
        backgroundColor: '#1e1e1e', // ログ画面のトーンに合わせた背景
        borderRadius: '5px',
        maxHeight: '300px',
        overflowY: 'auto'
      }}>
        {urls.map((url, idx) => (
          <div key={idx} className="preview-image-wrapper" style={{ position: 'relative' }}>
            <img 
              src={url} 
              alt={`uploaded-${idx}`} 
              style={{ 
                width: '80px', 
                height: '80px', 
                objectFit: 'contain', 
                border: '1px solid #444',
                borderRadius: '4px',
                backgroundColor: '#2d2d2d'
              }} 
              // 万が一画像読み込みに失敗した時のフォールバック
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// --- メインコンポーネント ---

function App() {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const newestRequestRef = useRef(null);

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

  useEffect(() => {
    if (newestRequestRef.current) {
      newestRequestRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [messages]);

  const lastRequestIndex = [...messages].reverse().findIndex(m => m.side !== 'right');
  const targetIndex = lastRequestIndex !== -1 ? (messages.length - 1 - lastRequestIndex) : -1;

  const scrollToRequest = (id) => {
    const element = document.getElementById(`unit-${id}`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const getFormattedText = (msg) => {
    const isRes = msg.side === 'right';
    
    const output = isRes ? {
      type: "RESPONSE",
      status: msg.status,
      timestamp: msg.timestamp,
      headers: msg.headers || {},
      body: msg.body
    } : {
      type: "REQUEST",
      method: msg.method,
      path: msg.path,
      timestamp: msg.timestamp,
      headers: msg.headers || {},
      query: msg.query || {},
      body: msg.body,
      images: msg.images || [] // クリップボード/DL用データにも一応画像URLを含める
    };

    return JSON.stringify(output, null, 2);
  };

  const handleCopy = (msg) => {
    const text = getFormattedText(msg);
    navigator.clipboard.writeText(text).then(() => {
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
      </header>

      <div className="main-layout">
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

        <main className="content-area">
          <div className="balloon-container">
            {messages.map((msg, index) => {
              const isRight = msg.side === 'right';
              const isTargetUnit = index === targetIndex;

              return (
                <div 
                  key={msg.id} 
                  id={`unit-${msg.id}`} 
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
                        <InfoSection title="Response Headers" data={msg.headers} />
                        <InfoSection title="Response Body" data={msg.body} />
                      </>
                    ) : (
                      <>
                        <InfoSection title="Request Headers" data={msg.headers} />
                        <InfoSection title="Query Parameters" data={msg.query} />
                        
                        {/* ★修正：msg.body をそのままシンプルに渡す（二重ラップ { body: msg.body } を廃止） */}
                        <InfoSection title="Request Body" data={msg.body} />
                        
                        {/* 画像があれば下部にプレビューを並べる */}
                        {msg.images && msg.images.length > 0 && (
                          <ImagePreviewSection title="Uploaded Images Preview" urls={msg.images} />
                        )}
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