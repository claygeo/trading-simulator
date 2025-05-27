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
    // Only create connection if we have a simulationId
    if (!simulationId) {
      return;
    }

    // Create WebSocket connection
    const ws = new WebSocket(WS_BASE_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Subscribe to the simulation
      ws.send(JSON.stringify({ 
        type: 'subscribe', 
        simulationId: simulationIdRef.current 
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const rawData = event.data;
        
        // Handle different message formats
        let message: WebSocketMessage;
        
        if (typeof rawData === 'string') {
          const parsed = JSON.parse(rawData);
          
          // Check if this is a status message or other non-simulation message
          if (parsed.type && !parsed.simulationId) {
            console.log('Received status message:', parsed);
            return;
          }
          
          // Validate the message structure
          if (!parsed.simulationId || !parsed.event || !parsed.event.type) {
            console.warn('Invalid message structure:', parsed);
            return;
          }
          
          message = parsed as WebSocketMessage;
        } else {
          console.warn('Received non-string WebSocket message:', rawData);
          return;
        }
        
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
        console.error('Error parsing WebSocket message:', error);
        console.error('Raw message:', event.data);
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
    
    // Clean up on unmount or when simulationId changes
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [simulationId]); // Only recreate connection when simulationId changes
  
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