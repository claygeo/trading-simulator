// frontend/src/components/WebSocketDebug.tsx
import React from 'react';

interface WebSocketDebugProps {
  isConnected: boolean;
  connectionError: string | null;
  messageStats: {
    received: number;
    processed: number;
    dropped: number;
  };
}

export const WebSocketDebug: React.FC<WebSocketDebugProps> = ({
  isConnected,
  connectionError,
  messageStats
}) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: 10,
      right: 10,
      padding: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      fontSize: '12px',
      borderRadius: '5px',
      zIndex: 9999
    }}>
      <div style={{ marginBottom: '5px' }}>
        WebSocket: {' '}
        <span style={{ 
          color: isConnected ? '#4caf50' : '#f44336',
          fontWeight: 'bold' 
        }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      {connectionError && (
        <div style={{ color: '#ff9800', marginBottom: '5px' }}>
          Error: {connectionError}
        </div>
      )}
      
      <div>
        Messages - R: {messageStats.received} | P: {messageStats.processed} | D: {messageStats.dropped}
      </div>
      
      {messageStats.received > 0 && (
        <div>
          Efficiency: {((messageStats.processed / messageStats.received) * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
};