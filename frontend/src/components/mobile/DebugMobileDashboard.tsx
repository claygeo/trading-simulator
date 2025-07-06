// frontend/src/components/mobile/DebugMobileDashboard.tsx
// COMPLETE FIXED VERSION - ALL TYPESCRIPT ERRORS RESOLVED
import React, { useState, useEffect } from 'react';

const DebugMobileDashboard: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [chartLibraryStatus, setChartLibraryStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [wsStatus, setWsStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const addDebug = (message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`🔍 DEBUG: ${message}`);
    setDebugInfo(prev => [...prev, `${timestamp.substr(11, 8)}: ${message}`]);
  };

  // Helper function for fetch with timeout using AbortController
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 5000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  useEffect(() => {
    addDebug("🚀 DebugMobileDashboard mounted");
    
    // Test 1: Basic mobile detection
    const isMobile = window.innerWidth <= 768;
    addDebug(`📱 Screen: ${window.innerWidth}x${window.innerHeight}, Mobile: ${isMobile}`);
    
    // Test 2: User agent check
    const userAgent = navigator.userAgent;
    addDebug(`🖥️ User Agent: ${userAgent.substring(0, 100)}...`);
    
    // Test 3: Touch support
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    addDebug(`👆 Touch support: ${hasTouch}, Max touch points: ${navigator.maxTouchPoints}`);
    
    // Test 4: Browser capabilities
    const capabilities = {
      localStorage: typeof Storage !== 'undefined',
      webSocket: typeof WebSocket !== 'undefined',
      canvas: document.createElement('canvas').getContext !== undefined,
      webGL: (() => {
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
          return false;
        }
      })(),
      fetch: typeof fetch !== 'undefined',
      promises: typeof Promise !== 'undefined'
    };
    addDebug(`🌐 Browser capabilities: ${Object.entries(capabilities).map(([k, v]) => `${k}:${v}`).join(', ')}`);
    
    // Test 5: Environment variables
    const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
      REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
      REACT_APP_BACKEND_WS_URL: process.env.REACT_APP_BACKEND_WS_URL,
      REACT_APP_WS_HOST: process.env.REACT_APP_WS_HOST,
      REACT_APP_WS_PORT: process.env.REACT_APP_WS_PORT,
      REACT_APP_ENV: process.env.REACT_APP_ENV,
      REACT_APP_DEBUG: process.env.REACT_APP_DEBUG
    };
    addDebug(`🔧 Environment vars: ${Object.entries(envVars).map(([k, v]) => `${k}:${v || 'undefined'}`).join(', ')}`);
    
    // Test 6: Memory info (if available)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      addDebug(`🧠 Memory: Used ${usedMB}MB, Total ${totalMB}MB, Limit ${limitMB}MB`);
    } else {
      addDebug(`🧠 Memory info not available`);
    }
    
    // Test 7: Network info
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      addDebug(`📶 Network: ${connection.effectiveType || 'unknown'}, Downlink: ${connection.downlink || 'unknown'}Mbps`);
    }
    
    setCurrentStep(1);
    
    // Test 8: TradingView Charts library loading
    setTimeout(() => {
      try {
        addDebug("📈 Testing TradingView Charts import...");
        import('lightweight-charts').then((charts) => {
          addDebug("✅ TradingView Charts library loaded successfully");
          addDebug(`📊 Charts version: ${charts.version || 'unknown'}`);
          setChartLibraryStatus('success');
          setCurrentStep(2);
        }).catch(error => {
          addDebug(`❌ TradingView Charts library failed: ${error instanceof Error ? error.message : String(error)}`);
          setChartLibraryStatus('error');
          setCurrentStep(-1);
        });
      } catch (error) {
        addDebug(`❌ Error importing TradingView Charts: ${error instanceof Error ? error.message : String(error)}`);
        setChartLibraryStatus('error');
        setCurrentStep(-1);
      }
    }, 1000);

  }, []);

  const testAPI = async () => {
    setApiStatus('testing');
    addDebug("🌐 Testing API connection...");
    
    const apiUrls = [
      'http://localhost:3001/api/health',
      'http://localhost:3001/health',
      'http://localhost:3001',
      process.env.REACT_APP_API_BASE_URL + '/health',
      process.env.REACT_APP_BACKEND_URL + '/api/health',
      process.env.REACT_APP_BACKEND_URL + '/health'
    ].filter(Boolean);

    for (const url of apiUrls) {
      try {
        addDebug(`🔍 Trying API: ${url}`);
        
        // Fixed: Using fetchWithTimeout instead of timeout option
        const response = await fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }, 5000);
        
        if (response.ok) {
          const data = await response.text();
          addDebug(`✅ API success: ${url} - Status: ${response.status}`);
          addDebug(`📦 Response: ${data.substring(0, 100)}...`);
          setApiStatus('success');
          return;
        } else {
          addDebug(`⚠️ API error: ${url} - Status: ${response.status}`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          addDebug(`⏰ API timeout: ${url} (5 seconds)`);
        } else {
          addDebug(`❌ API failed: ${url} - Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    setApiStatus('error');
    addDebug(`❌ All API endpoints failed`);
  };

  const testWebSocket = () => {
    setWsStatus('testing');
    addDebug("🔌 Testing WebSocket connection...");
    
    // Your actual WebSocket URLs from .env
    const wsUrls = [
      'ws://localhost:3001',                                    // Your main WebSocket URL
      process.env.REACT_APP_BACKEND_WS_URL,                   // From .env
      `ws://${process.env.REACT_APP_WS_HOST}:${process.env.REACT_APP_WS_PORT}`, // Constructed from .env
      'ws://localhost:3000',                                   // Alternative port
      'ws://localhost:8080'                                    // Alternative port
    ].filter(Boolean);

    addDebug(`🔌 Testing ${wsUrls.length} WebSocket URLs...`);

    let successfulConnection = false;

    wsUrls.forEach((url, index) => {
      try {
        addDebug(`🔍 Trying WebSocket: ${url}`);
        const ws = new WebSocket(url);
        
        const timeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            addDebug(`⏰ WebSocket timeout: ${url}`);
          }
        }, 5000);
        
        ws.onopen = () => {
          clearTimeout(timeout);
          addDebug(`✅ WebSocket connected: ${url}`);
          addDebug(`🔗 ReadyState: ${ws.readyState}, Protocol: ${ws.protocol || 'none'}`);
          
          if (!successfulConnection) {
            successfulConnection = true;
            setWsStatus('success');
          }
          
          // Test sending a message
          try {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            addDebug(`📤 Test message sent to ${url}`);
          } catch (sendError) {
            addDebug(`❌ Failed to send test message: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
          }
          
          setTimeout(() => ws.close(), 2000);
        };
        
        ws.onerror = (error) => {
          clearTimeout(timeout);
          addDebug(`❌ WebSocket error: ${url} - ${error instanceof Event ? error.type || 'Unknown error' : 'Unknown error'}`);
        };
        
        ws.onclose = (event) => {
          clearTimeout(timeout);
          addDebug(`🔒 WebSocket closed: ${url} - Code: ${event.code}, Reason: ${event.reason || 'No reason'}`);
          
          if (index === wsUrls.length - 1 && !successfulConnection) {
            setWsStatus('error');
            addDebug(`❌ All WebSocket connections failed`);
          }
        };
        
        ws.onmessage = (event) => {
          addDebug(`📥 WebSocket message: ${event.data.substring(0, 100)}...`);
        };
        
      } catch (error) {
        addDebug(`❌ WebSocket creation error: ${url} - ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  };

  const testMobileComponents = async () => {
    addDebug("🧩 Testing mobile component imports...");
    
    const components = [
      { name: 'MobileHeader', path: './MobileHeader' },
      { name: 'MobileChart', path: './MobileChart' },
      { name: 'MobileTabs', path: './MobileTabs' },
      { name: 'MobileParticipants', path: './mobile-sections/MobileParticipants' },
      { name: 'MobileOrderBook', path: './mobile-sections/MobileOrderBook' },
      { name: 'MobileRecentTrades', path: './mobile-sections/MobileRecentTrades' }
    ];

    for (const component of components) {
      try {
        addDebug(`🔍 Testing import: ${component.name}`);
        const module = await import(component.path);
        if (module.default) {
          addDebug(`✅ Component loaded: ${component.name}`);
        } else {
          addDebug(`⚠️ Component missing default export: ${component.name}`);
        }
      } catch (error) {
        addDebug(`❌ Component failed: ${component.name} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const runFullDiagnostics = async () => {
    addDebug("🔄 Running full mobile diagnostics...");
    await testAPI();
    testWebSocket();
    await testMobileComponents();
    addDebug("🏁 Diagnostics complete");
  };

  const clearAndReload = () => {
    setDebugInfo([]);
    setCurrentStep(0);
    setChartLibraryStatus('loading');
    setApiStatus('idle');
    setWsStatus('idle');
    window.location.reload();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'testing': return 'text-yellow-400';
      case 'loading': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'testing': return '🔄';
      case 'loading': return '⏳';
      default: return '❓';
    }
  };

  return (
    <div className="h-screen w-full bg-[#0B1426] text-white p-4 overflow-auto">
      <div className="max-w-full">
        <h1 className="text-xl font-bold mb-4 text-green-400">
          🔍 Mobile Trading Debug Dashboard
        </h1>
        
        {/* Status Overview */}
        <div className="mb-4">
          <div className={`inline-block px-3 py-1 rounded-full text-sm ${
            currentStep === -1 ? 'bg-red-600' :
            currentStep === 0 ? 'bg-yellow-600' :
            currentStep === 1 ? 'bg-blue-600' :
            'bg-green-600'
          }`}>
            Status: {
              currentStep === -1 ? 'ERROR DETECTED' :
              currentStep === 0 ? 'Initializing...' :
              currentStep === 1 ? 'Basic checks passed' :
              'Ready for testing!'
            }
          </div>
          
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className={`p-2 bg-gray-800 rounded ${getStatusColor(chartLibraryStatus)}`}>
              {getStatusIcon(chartLibraryStatus)} Charts: {chartLibraryStatus}
            </div>
            <div className={`p-2 bg-gray-800 rounded ${getStatusColor(apiStatus)}`}>
              {getStatusIcon(apiStatus)} API: {apiStatus}
            </div>
            <div className={`p-2 bg-gray-800 rounded ${getStatusColor(wsStatus)}`}>
              {getStatusIcon(wsStatus)} WebSocket: {wsStatus}
            </div>
            <div className="p-2 bg-gray-800 rounded text-blue-400">
              📱 Mobile Ready
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          <button 
            onClick={testAPI}
            disabled={apiStatus === 'testing'}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-3 py-2 rounded text-sm transition"
          >
            {apiStatus === 'testing' ? '🔄 Testing API...' : '🌐 Test API'}
          </button>
          
          <button 
            onClick={testWebSocket}
            disabled={wsStatus === 'testing'}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 py-2 rounded text-sm transition"
          >
            {wsStatus === 'testing' ? '🔄 Testing WS...' : '🔌 Test WebSocket'}
          </button>
          
          <button 
            onClick={testMobileComponents}
            className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition"
          >
            🧩 Test Components
          </button>
          
          <button 
            onClick={runFullDiagnostics}
            className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm transition"
          >
            🔍 Full Diagnostics
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-4">
          <button 
            onClick={clearAndReload}
            className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm transition"
          >
            🔄 Clear & Reload
          </button>
          
          <a 
            href="/" 
            className="bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded text-sm transition text-center"
          >
            🏠 Back to Main App
          </a>
        </div>

        {/* Configuration Display */}
        <div className="bg-gray-800 rounded-lg p-3 mb-4">
          <h3 className="text-sm font-bold mb-2 text-blue-400">📋 Current Configuration:</h3>
          <div className="text-xs space-y-1 font-mono">
            <div>🌐 Backend: <span className="text-green-400">{process.env.REACT_APP_BACKEND_URL || 'Not configured'}</span></div>
            <div>🔌 WebSocket: <span className="text-green-400">{process.env.REACT_APP_BACKEND_WS_URL || 'Not configured'}</span></div>
            <div>🛠️ API Base: <span className="text-green-400">{process.env.REACT_APP_API_BASE_URL || 'Not configured'}</span></div>
            <div>🔧 Environment: <span className="text-green-400">{process.env.REACT_APP_ENV || process.env.NODE_ENV || 'unknown'}</span></div>
            <div>📱 Screen: <span className="text-green-400">{window.innerWidth}x{window.innerHeight}</span></div>
            <div>🌍 URL: <span className="text-green-400">{window.location.href}</span></div>
          </div>
        </div>

        {/* Debug Log */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h3 className="text-sm font-bold mb-2 text-blue-400">
            📋 Debug Log ({debugInfo.length} entries):
          </h3>
          <div className="text-xs font-mono space-y-1 max-h-64 overflow-y-auto bg-gray-900 p-2 rounded">
            {debugInfo.length === 0 ? (
              <div className="text-gray-500">Initializing debug session...</div>
            ) : (
              debugInfo.map((info, index) => (
                <div key={index} className="text-gray-300 break-all">
                  {info}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Success Instructions */}
        {currentStep >= 2 && chartLibraryStatus === 'success' && (
          <div className="mt-4 bg-green-900 border border-green-500 rounded-lg p-3">
            <h3 className="text-green-400 font-bold mb-2">✅ Looking Good!</h3>
            <div className="text-sm text-green-100 space-y-1">
              <p>• Mobile detection is working</p>
              <p>• TradingView Charts library loaded successfully</p>
              <p>• Basic browser capabilities confirmed</p>
              <p><strong>Next:</strong> Test the API and WebSocket connections above</p>
              <p><strong>Note:</strong> On Netlify, localhost URLs will fail (expected)</p>
            </div>
          </div>
        )}

        {/* Error Instructions */}
        {currentStep === -1 && (
          <div className="mt-4 bg-red-900 border border-red-500 rounded-lg p-3">
            <h3 className="text-red-400 font-bold mb-2">❌ Issue Detected</h3>
            <div className="text-sm text-red-100 space-y-1">
              <p>• Check the debug log above for specific errors</p>
              <p>• TradingView Charts may not be compatible with this browser</p>
              <p>• Try running the full diagnostics</p>
              <p>• Canvas-based chart alternative available if needed</p>
            </div>
          </div>
        )}

        {/* Netlify-specific Info */}
        <div className="mt-4 bg-yellow-900 border border-yellow-500 rounded-lg p-3">
          <h3 className="text-yellow-400 font-bold mb-2">🚀 Netlify Deployment Notes</h3>
          <div className="text-sm text-yellow-100 space-y-1">
            <p>• <strong>Expected:</strong> API/WebSocket tests will fail (localhost URLs don't work on Netlify)</p>
            <p>• <strong>Important:</strong> Mobile detection and chart loading should work</p>
            <p>• <strong>Next step:</strong> Configure production backend URLs for Netlify</p>
            <p>• <strong>Test focus:</strong> Mobile detection, browser capabilities, component loading</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-xs text-gray-500">
          <p>📱 Mobile Trading Simulator Debug Tool v3.0</p>
          <p>All TypeScript errors fixed • Netlify compatible • Error handling improved</p>
          <p>Check browser console (F12) for additional error details</p>
        </div>
      </div>
    </div>
  );
};

export default DebugMobileDashboard;