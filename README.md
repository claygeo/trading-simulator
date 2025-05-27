 
# Trading Simulation Platform

## Overview

A professional-grade trading simulation that brings real cryptocurrency market dynamics to your screen. This educational platform queries and analyzes 118 actual trades from Dune Analytics, transforming raw blockchain data into an interactive trading experience. Watch how traders react to market volatility, understand order book dynamics, and develop your trading intuition—all without risking a single dollar. Built to mirror the interfaces of Binance, Kucoin, and Bybit for authentic learning.

# Trading Simulation Platform

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [Professional Trading Dashboard](#professional-trading-dashboard)
  - [Simulation Engine](#simulation-engine)
  - [Technical Implementation](#technical-implementation)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Key Components](#key-components)
    - [PriceChart.tsx](#pricechart.tsx)
    - [OrderBook.tsx](#orderbook.tsx)
    - [Simulation Controls](#simulation-controls)
  - [API Integration](#api-integration)
- [Customization](#customization)
  - [Styling](#styling)
  - [Adding Features](#adding-features)
- [Performance Optimization](#performance-optimization)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)

---

## Overview

This is a  trading simulation dashboard that recreates the experience of cryptocurrency trading platforms like Binance, Kucoin, and Bybit. It features realistic market dynamics, order book visualization, trade execution, and trader performance tracking in

## Key Features

### Professional Trading Dashboard
- **TradingView-Style Price Chart**: Candlestick visualization with 300 candles and technical indicators
- **Real-Time Order Book**: Shows 10 sell and 10 buy orders with dynamic updates
- **Recent Trades Feed**: Horizontal scrolling display of executed trades
- **Trader Leaderboard**: Performance tracking with metrics like PnL and balance

### Simulation Engine
- **Variable Speed Control**: Adjustable simulation speeds (1x-10x) with pause/resume functionality
- **Pre-Populated Data**: Charts initialize with historical data for immediate context
- **Market Condition Detection**: Automatically identifies market states (bullish, bearish, volatile, etc.)
- **Dynamic Audio Feedback**: Background music that changes based on market conditions

### Technical Implementation
- **React with TypeScript**: Strongly-typed components for reliability and maintainability
- **WebSocket Integration**: Real-time updates of price, orders, and trades
- **Canvas-Based Charting**: High-performance rendering of price data
- **Custom Data Generation**: Realistic synthetic price data when needed

## Screenshots

![image](https://github.com/user-attachments/assets/a5916eea-f6ef-4f7d-96a1-3e526aa0da2c)

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pump-fun-simulator.git
cd pump-fun-simulator
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm start
# or
yarn start
```

4. Open your browser to `http://localhost:3000`

## Development

### Project Structure
```
/src
├── components/           # React components
│   ├── Dashboard.tsx     # Main dashboard layout
│   ├── PriceChart.tsx    # TradingView-style chart
│   ├── OrderBook.tsx     # Order book display
│   ├── RecentTrades.tsx  # Trade history
│   └── ...
├── services/             # API and WebSocket services
├── types/                # TypeScript interfaces
├── utils/                # Helper functions
└── styles/               # CSS/SCSS files
```

### Key Components

#### PriceChart.tsx
Implements a professional candlestick chart that displays up to 300 candles with:
- 15-minute timeframe visualization
- Current price indicator
- Trade markers for significant trades
- TradingView-inspired styling

#### OrderBook.tsx
Displays the order book with:
- 10 levels of buy orders (bids)
- 10 levels of sell orders (asks)
- Dynamic price flashing on updates
- Depth visualization

#### Simulation Controls
Features for controlling the simulation:
- Start/Pause/Reset buttons
- Speed adjustment (1x, 2x, 3x, 6x)
- Real-time status indicators

### API Integration

The platform connects to a simulation backend that provides:
- Market data (price candles, current price)
- Order book updates
- Trade execution events
- Trader position information

## Customization

### Styling
The dashboard uses Tailwind CSS for styling. Key theme variables can be modified in `tailwind.config.js`.

### Adding Features
To extend the platform with new features:
1. Create new component files in `/src/components`
2. Update the Dashboard layout in `Dashboard.tsx`
3. Add any required API endpoints in the services directory

## Performance Optimization

The simulation is optimized for performance with:
- Canvas-based rendering for charts
- Efficient DOM updates
- WebSocket data compression
- Client-side data management to minimize updates

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- TradingView for chart inspiration
- Binance, Kucoin, and Bybit for interface design inspiration
- Dune Analytics for market data concepts

---

© 2025 Pump.fun Trader Simulation Platform
