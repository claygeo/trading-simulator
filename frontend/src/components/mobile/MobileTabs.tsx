// frontend/src/components/mobile/MobileTabs.tsx
import React from 'react';

interface MobileTabsProps {
  activeTab: 'participants' | 'orderbook' | 'trades';
  onTabChange: (tab: 'participants' | 'orderbook' | 'trades') => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  tradersCount: number;
  tradesCount: number;
  orderBookSize: number;
}

const MobileTabs: React.FC<MobileTabsProps> = ({
  activeTab,
  onTabChange,
  isExpanded,
  onToggleExpanded,
  tradersCount,
  tradesCount,
  orderBookSize
}) => {
  
  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const getTabConfig = () => {
    return [
      {
        id: 'participants' as const,
        label: 'Participants',
        shortLabel: 'Traders',
        icon: '👥',
        count: tradersCount,
        color: 'text-blue-400',
        activeColor: 'border-blue-400 text-blue-400 bg-blue-900'
      },
      {
        id: 'orderbook' as const,
        label: 'Order Book',
        shortLabel: 'Book',
        icon: '📋',
        count: orderBookSize,
        color: 'text-purple-400',
        activeColor: 'border-purple-400 text-purple-400 bg-purple-900'
      },
      {
        id: 'trades' as const,
        label: 'Recent Trades',
        shortLabel: 'Trades',
        icon: '⚡',
        count: tradesCount,
        color: 'text-green-400',
        activeColor: 'border-green-400 text-green-400 bg-green-900'
      }
    ];
  };

  const tabs = getTabConfig();

  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Tab Navigation Bar */}
      <div className="flex items-center">
        {/* Tab Buttons */}
        <div className="flex-1 flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 py-3 px-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === tab.id
                  ? tab.activeColor
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-750'
              }`}
            >
              <div className="flex flex-col items-center space-y-1">
                {/* Icon and Label */}
                <div className="flex items-center space-x-1">
                  <span className="text-xs">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </div>
                
                {/* Count Badge */}
                <div className={`text-xs font-mono ${
                  activeTab === tab.id ? 'text-white' : tab.color
                }`}>
                  {formatCount(tab.count)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Expand/Collapse Toggle */}
        <div className="px-3 py-3 border-l border-gray-700">
          <button
            onClick={onToggleExpanded}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isExpanded 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title={isExpanded ? 'Collapse content' : 'Expand content'}
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M7 14l5-5 5 5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Active Tab Indicator Bar */}
      <div className="h-1 bg-gray-900 relative overflow-hidden">
        <div 
          className={`absolute top-0 h-full transition-all duration-300 ease-out ${
            activeTab === 'participants' ? 'bg-blue-400' :
            activeTab === 'orderbook' ? 'bg-purple-400' :
            'bg-green-400'
          }`}
          style={{
            width: '33.333%',
            left: activeTab === 'participants' ? '0%' : 
                  activeTab === 'orderbook' ? '33.333%' : '66.666%'
          }}
        />
      </div>

      {/* Tab Content Summary (when collapsed) */}
      {!isExpanded && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              <span className="text-gray-400">
                {tabs.find(t => t.id === activeTab)?.label}:
              </span>
              <span className="text-white font-medium">
                {formatCount(tabs.find(t => t.id === activeTab)?.count || 0)} items
              </span>
            </div>
            
            <div className="flex items-center space-x-3 text-gray-500">
              {tabs.map((tab) => (
                <div key={tab.id} className="flex items-center space-x-1">
                  <span>{tab.icon}</span>
                  <span className={activeTab === tab.id ? 'text-white' : tab.color}>
                    {formatCount(tab.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Quick Action Hint */}
          <div className="mt-1 text-center">
            <span className="text-gray-500 text-xs">
              Tap {isExpanded ? '⬆️' : '⬇️'} to {isExpanded ? 'collapse' : 'expand'} • 
              Switch tabs above
            </span>
          </div>
        </div>
      )}

      {/* Performance Indicators */}
      {isExpanded && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            {/* Active Tab Info */}
            <div className="flex items-center space-x-2">
              <div className={`flex items-center space-x-1 ${
                tabs.find(t => t.id === activeTab)?.color || 'text-gray-400'
              }`}>
                <span>{tabs.find(t => t.id === activeTab)?.icon}</span>
                <span className="font-medium">
                  {tabs.find(t => t.id === activeTab)?.label}
                </span>
              </div>
              
              {/* Live Update Indicator */}
              {(activeTab === 'trades' && tradesCount > 0) && (
                <div className="flex items-center space-x-1 text-green-400">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Live</span>
                </div>
              )}
              
              {(activeTab === 'participants' && tradersCount >= 118) && (
                <div className="text-blue-400">
                  ✅ All traders loaded
                </div>
              )}
            </div>

            {/* All Tab Counts Summary */}
            <div className="flex items-center space-x-3">
              {tabs.map((tab, index) => (
                <React.Fragment key={tab.id}>
                  {index > 0 && <span className="text-gray-600">|</span>}
                  <div className={`flex items-center space-x-1 ${
                    activeTab === tab.id ? 'text-white' : tab.color
                  }`}>
                    <span className="text-xs">{tab.icon}</span>
                    <span className="font-mono">{formatCount(tab.count)}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileTabs;