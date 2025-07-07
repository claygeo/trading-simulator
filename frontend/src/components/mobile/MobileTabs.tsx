// frontend/src/components/mobile/MobileTabs.tsx - FIXED: Clean Professional Labels
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
  
  // Clean tab configuration WITHOUT any decorative elements
  const getTabConfig = () => {
    return [
      {
        id: 'participants' as const,
        label: 'Traders',
        fullLabel: 'Traders',
        count: tradersCount,
        color: 'text-blue-400',
        activeColor: 'border-blue-400 text-blue-400 bg-blue-900',
        bgColor: 'bg-blue-500'
      },
      {
        id: 'orderbook' as const,
        label: 'Orderbook',
        fullLabel: 'Orderbook',
        count: orderBookSize,
        color: 'text-purple-400',
        activeColor: 'border-purple-400 text-purple-400 bg-purple-900',
        bgColor: 'bg-purple-500'
      },
      {
        id: 'trades' as const,
        label: 'Recent Trades',
        fullLabel: 'Recent Trades',
        count: tradesCount,
        color: 'text-green-400',
        activeColor: 'border-green-400 text-green-400 bg-green-900',
        bgColor: 'bg-green-500'
      }
    ];
  };

  const tabs = getTabConfig();

  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Tab Navigation Bar */}
      <div className="flex items-center">
        {/* Clean Tab Buttons - Professional design without decorative elements */}
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
              {/* Clean labels without any count numbers or decorative elements */}
              <div className="flex items-center justify-center">
                <span className="hidden sm:inline">{tab.fullLabel}</span>
                <span className="sm:hidden">{tab.label}</span>
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

      {/* Simplified content summary when collapsed */}
      {!isExpanded && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">
                {tabs.find(t => t.id === activeTab)?.fullLabel}
              </span>
            </div>
            
            <div className="text-center">
              <span className="text-gray-500 text-xs">
                Tap ↓ to expand
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileTabs;