// frontend/src/services/websocket.ts
import { useState, useEffect } from 'react';

const WS_BASE_URL = process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:3001';

interface WebSocketMessage {
  simulationId: string;
  event: {
    type: string;
    timestamp: number;
    data: any;
  };
}

export const useWebSocket = (simulationId?: string) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  
  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(WS_BASE_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // If a simulation ID is provided, send a message to subscribe to that simulation
      if (simulationId) {
        ws.send(JSON.stringify({ 
          type: 'subscribe', 
          simulationId 
        }));
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
        setMessages(prev => [...prev, message]);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    setSocket(ws);
    
    // Clean up on unmount
    return () => {
      ws.close();
    };
  }, [simulationId]);
  
  // Function to send messages to the server
  const sendMessage = (message: any) => {
    if (socket && isConnected) {
      socket.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message, socket is not connected');
    }
  };
  
  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    sendMessage
  };
};