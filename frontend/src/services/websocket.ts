// frontend/src/services/websocket.ts
import { useState, useEffect, useRef } from 'react';

const WS_BASE_URL = process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:3001';

interface WebSocketMessage {
  simulationId: string;
  event: {
    type: string;
    timestamp: number;
    data: any;
  };
}

export const useWebSocket = (simulationId?: string, isPaused?: boolean) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  
  // Store the simulationId and pause state in refs to avoid dependency issues
  const simulationIdRef = useRef<string | undefined>(simulationId);
  const isPausedRef = useRef<boolean>(isPaused || false);
  
  // Update the refs when the values change
  useEffect(() => {
    simulationIdRef.current = simulationId;
  }, [simulationId]);

  useEffect(() => {
    isPausedRef.current = isPaused || false;
  }, [isPaused]);

  // Track the last processed message to avoid duplicate processing
  const lastProcessedMessageRef = useRef<string>('');
  
  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(WS_BASE_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // If a simulation ID is provided, send a message to subscribe to that simulation
      if (simulationIdRef.current) {
        ws.send(JSON.stringify({ 
          type: 'subscribe', 
          simulationId: simulationIdRef.current 
        }));
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        
        // Create a unique identifier for this message to avoid duplicate processing
        const messageId = `${message.simulationId}-${message.event.type}-${message.event.timestamp}`;
        
        // Skip if we've already processed this exact message
        if (messageId === lastProcessedMessageRef.current) {
          return;
        }
        
        // Store this message ID as the last processed
        lastProcessedMessageRef.current = messageId;
        
        // Only process messages for our current simulation
        if (simulationIdRef.current && message.simulationId !== simulationIdRef.current) {
          return;
        }
        
        // Skip price updates when paused
        if (isPausedRef.current && message.event.type === 'price_update') {
          return;
        }
        
        setLastMessage(message);
        
        // Limit the number of stored messages to prevent memory issues
        setMessages(prev => {
          const newMessages = [...prev, message];
          if (newMessages.length > 100) {
            return newMessages.slice(-100);
          }
          return newMessages;
        });
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
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []); // Empty dependency array to only create the connection once
  
  // Function to send messages to the server
  const sendMessage = (message: any) => {
    if (socket && isConnected) {
      socket.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message, socket is not connected');
    }
  };
  
  // Function to notify server about pause state
  const setPauseState = (paused: boolean) => {
    if (socket && isConnected && simulationIdRef.current) {
      socket.send(JSON.stringify({
        type: 'setPauseState',
        simulationId: simulationIdRef.current,
        isPaused: paused
      }));
    }
  };
  
  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    sendMessage,
    setPauseState
  };
};