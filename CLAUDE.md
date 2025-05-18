# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oximeter PWA is a Progressive Web Application that connects to Bluetooth pulse oximeters to display blood oxygen levels, heart rate, and pulse waveform visualization. It uses the Web Bluetooth API to communicate with compatible devices and is designed to work fully offline.

## Technology Stack

- React 19
- Vite 6
- TailwindCSS 4
- Chart.js for visualization
- IndexedDB for offline data storage
- vite-plugin-pwa for service worker generation
- shadcn/ui components (partially implemented)
- TypeScript (partially implemented)

## Commands

### Development

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Architecture

The application uses a single-page architecture with offline capabilities:

1. **Main App Component** (`src/App.jsx`): Contains all the core functionality:
   - Connects to the pulse oximeter via Bluetooth
   - Parses data from the device
   - Displays oxygen levels and heart rate
   - Renders the pulse waveform chart
   - Handles online/offline state changes

2. **Data Processing**: 
   - The `bufferToSamples` function parses binary data from the device
   - Data packets have two types:
     - Measurement frames (0xF1): Contain BPM and SpO2 readings
     - Waveform frames (0xF0): Contain pulse graph points

3. **Bluetooth Connectivity**:
   - Uses Web Bluetooth API to connect to devices with service UUID: "0000fee0-0000-1000-8000-00805f9b34fb"
   - Searches for and connects to BLE-enabled pulse oximeters
   - Sets up notification listeners for real-time data updates
   - Handles device disconnection with reconnection logic

4. **Offline Data Storage**:
   - Uses IndexedDB (`src/utils/storage.js`) to store readings and settings
   - Provides fallback to localStorage when IndexedDB isn't available
   - Loads historical readings from persistent storage on startup
   - Maintains app functionality during offline periods

5. **Progressive Web App Features**:
   - Configured with vite-plugin-pwa for automated service worker generation
   - App installation promotion with custom install button
   - Works offline with cached assets and data
   - Background sync to save readings when offline
   - Manifest file for proper installation

## Code Conventions

- React functional components with hooks
- State management via React's useState and useRef
- Path aliases are configured with '@/' pointing to 'src/' directory
- TailwindCSS for styling
- Async/await for asynchronous operations
- Try/catch blocks for error handling