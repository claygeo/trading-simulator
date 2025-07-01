// frontend/src/components/WebSocketTest.tsx
import React, { useEffect, useState } from 'react';

const WebSocketTest: React.FC = () => {
  const [wsState, setWsState] = useState<string>('Not connected');
  const [messages, setMessages] = useState<string[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Get the WebSocket URL from environment
    const wsPort = process.env.REACT_APP_WS_PORT || '3001';
    const wsHost = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${wsHost}:${wsPort}`;
    
    console.log('WebSocket Test - Connecting to:', wsUrl);
    console.log('Environment variables:', {
      REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
      REACT_APP_WS_PORT: process.env.REACT_APP_WS_PORT
    });
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('WebSocket Test - Connected!');
      setWsState('Connected to ' + wsUrl);
      setMessages(prev => [...prev, 'Connected to ' + wsUrl]);
    };
    
    websocket.onmessage = (event) => {
      console.log('WebSocket Test - Message:', event.data);
      setMessages(prev => [...prev, 'Received: ' + event.data]);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket Test - Error:', error);
      setWsState('Error connecting to ' + wsUrl);
      setMessages(prev => [...prev, 'Error: ' + error]);
    };
    
    websocket.onclose = (event) => {
      console.log('WebSocket Test - Closed:', event.code, event.reason);
      setWsState('Disconnected from ' + wsUrl);
      setMessages(prev => [...prev, `Closed: ${event.code} - ${event.reason}`]);
    };
    
    setWs(websocket);
    
    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, []);
  
  const sendTestMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const testMsg = JSON.stringify({ type: 'ping', timestamp: Date.now() });
      ws.send(testMsg);
      setMessages(prev => [...prev, 'Sent: ' + testMsg]);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      left: 10,
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '20px',
      borderRadius: '8px',
      maxWidth: '500px',
      maxHeight: '300px',
      overflow: 'auto',
      zIndex: 10000,
      fontSize: '12px',
      fontFamily: 'monospace'
    }}>
      <h3>WebSocket Connection Test</h3>
      <p>Status: {wsState}</p>
      <button 
        onClick={sendTestMessage}
        style={{
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '10px'
        }}
      >
        Send Test Ping
      </button>
      <div style={{ marginTop: '10px' }}>
        <h4>Messages:</h4>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '5px' }}>{msg}</div>
        ))}
      </div>
    </div>
  );
};

export default WebSocketTest;