// frontend/src/App.tsx
import React from 'react';
import Dashboard from './components/Dashboard';
import WebSocketTest from './components/WebSocketTest'; // You'll need to create this file

function App() {
  // Add a query parameter check to show the test component
  const showTest = new URLSearchParams(window.location.search).get('test') === 'ws';
  
  return (
    <div className="min-h-screen bg-background">
      {showTest && <WebSocketTest />}
      <Dashboard />
    </div>
  );
}

export default App;