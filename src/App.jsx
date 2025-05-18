import React, { useState, useRef, useEffect } from "react";
import { Line } from "react-chartjs-2";
//import { Card, CardContent } from "@/components/ui/card";
//import { Button } from "@/components/ui/button";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import { saveReading, getLatestReading, getReadings } from "./utils/storage";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend
);

function bufferToSamples(value) {
  // Parse byte array
  const arr = new Uint8Array(value.buffer);
  const header = arr[0];
  if (header === 0xF1 && arr.length >= 4) {
    // Measurement frame: [0xF1, bpm, spo2, ...]
    return { type: "measure", bpm: arr[1], spo2: arr[2] };
  }
  if (header === 0xF0) {
    // Waveform frame: [0xF0, ...samples]
    return { type: "waveform", samples: arr.slice(1) };
  }
  return null;
}

export default function App() {
  const [bpm, setBpm] = useState("--");
  const [spo2, setSpo2] = useState("--");
  const [waveform, setWaveform] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState(null);
  const [lastReadingTime, setLastReadingTime] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [displayInstallPrompt, setDisplayInstallPrompt] = useState(false);
  const [isWebBluetoothSupported, setIsWebBluetoothSupported] = useState(true);
  const [historicalReadings, setHistoricalReadings] = useState([]);
  const waveformBuf = useRef([]);
  const deferredPrompt = useRef(null);
  
  // Check if app is installed and support for required features
  useEffect(() => {
    // Check if app is in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    
    // Check for Web Bluetooth support
    if (!navigator.bluetooth) {
      setIsWebBluetoothSupported(false);
      setError("Web Bluetooth is not supported in this browser. Try Chrome on Android or Edge on Windows.");
    }
    
    // Listen for beforeinstallprompt event to detect if app can be installed
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the default browser install prompt
      e.preventDefault();
      // Store the event for later use
      deferredPrompt.current = e;
      // Show our custom install button
      setDisplayInstallPrompt(true);
    });
    
    // Listen for the appinstalled event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDisplayInstallPrompt(false);
    });
  }, []);
  
  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Trigger sync when coming back online
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
          .then(reg => reg.sync.register('sync-readings'))
          .catch(err => console.error('Sync registration failed:', err));
      }
    };
    
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check and manage device connection
  useEffect(() => {
    if (device) {
      // Add event listener for disconnection
      const handleDisconnect = () => {
        setIsConnected(false);
        setError("Device disconnected. Reconnect to continue monitoring.");
      };
      
      device.addEventListener('gattserverdisconnected', handleDisconnect);
      
      return () => {
        device.removeEventListener('gattserverdisconnected', handleDisconnect);
      };
    }
  }, [device]);

  // Reconnect automatically if connection is lost
  const reconnect = async () => {
    if (!device || !device.gatt) {
      setError("No device to reconnect to. Please connect first.");
      return;
    }

    try {
      setError(null);
      await setupDevice(device);
    } catch (e) {
      setError(`Reconnection failed: ${e.message}`);
    }
  };

  // Setup device and notification handlers
  const setupDevice = async (selectedDevice) => {
    try {
      const server = await selectedDevice.gatt.connect();
      const service = await server.getPrimaryService(
        "0000fee0-0000-1000-8000-00805f9b34fb"
      );
      
      // Find notify characteristic
      const chars = await service.getCharacteristics();
      const notifyChar = chars.find((c) => c.properties.notify);

      if (!notifyChar) throw new Error("Notify characteristic not found.");

      // Notification handler
      await notifyChar.startNotifications();
      notifyChar.addEventListener("characteristicvaluechanged", (event) => {
        const result = bufferToSamples(event.target.value);
        if (!result) return;
        if (result.type === "measure") {
          const newBpm = result.bpm;
          const newSpo2 = result.spo2;
          
          setBpm(newBpm);
          setSpo2(newSpo2);
          setLastReadingTime(new Date().toISOString());
          
          // Save readings to IndexedDB for offline access
          saveReading(newBpm, newSpo2)
            .catch(err => console.error('Failed to save reading:', err));
            
        } else if (result.type === "waveform") {
          waveformBuf.current = [
            ...waveformBuf.current.slice(-200 + result.samples.length),
            ...result.samples,
          ];
          setWaveform([...waveformBuf.current]);
        }
      });
      
      setIsConnected(true);
      setError(null);
    } catch (e) {
      setIsConnected(false);
      throw e;
    }
  };

  // Connect to device
  const connect = async () => {
    try {
      setError(null);
      
      // Check if Web Bluetooth is supported
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser");
      }
      
      // Request device
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: ["0000fee0-0000-1000-8000-00805f9b34fb"] }],
        optionalServices: ["0000fee0-0000-1000-8000-00805f9b34fb"],
      });
      
      setDevice(selectedDevice);
      await setupDevice(selectedDevice);
      
    } catch (e) {
      // Don't show error for user cancellation
      if (e.name !== 'NotFoundError') {
        setError(`Connection failed: ${e.message}`);
        console.error("Bluetooth connection error:", e);
      }
    }
  };

  // Load last reading on startup
  useEffect(() => {
    const loadLatestReading = async () => {
      try {
        const latestReading = await getLatestReading();
        if (latestReading) {
          if (bpm === "--") setBpm(latestReading.bpm);
          if (spo2 === "--") setSpo2(latestReading.spo2);
          setLastReadingTime(latestReading.timestamp);
        }
      } catch (e) {
        console.error("Failed to load last reading:", e);
      }
    };
    
    loadLatestReading();
    
    // Load historical readings for the last 24 hours
    const loadHistoricalReadings = async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const readings = await getReadings(yesterday, null, 100);
        setHistoricalReadings(readings);
      } catch (e) {
        console.error("Failed to load historical readings:", e);
      }
    };
    
    loadHistoricalReadings();
  }, []);

  // Handle PWA installation
  const installApp = async () => {
    if (!deferredPrompt.current) {
      console.log('Installation prompt not available');
      return;
    }
    
    // Show the installation prompt
    deferredPrompt.current.prompt();
    
    // Wait for the user to respond to the prompt
    const choiceResult = await deferredPrompt.current.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the installation prompt');
    } else {
      console.log('User dismissed the installation prompt');
    }
    
    // Clear the saved prompt
    deferredPrompt.current = null;
    setDisplayInstallPrompt(false);
  };

  // Format the timestamp for display
  const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch (e) {
      return 'Unknown time';
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-50 p-6">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="w-full bg-amber-500 text-white p-2 text-center mb-2 fixed top-0 left-0 z-50">
          You're offline. App will continue to work with your device.
        </div>
      )}
      
      <h1 className="text-2xl font-bold my-2">Oximeter PWA</h1>
      
      {/* Connection status indicator */}
      <div className="mb-2 flex items-center">
        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="w-full max-w-xs mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-md">
          {error}
        </div>
      )}
      
      {/* Warning for unsupported browsers */}
      {!isWebBluetoothSupported && (
        <div className="w-full max-w-xs mb-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded-md">
          Your browser doesn't support Web Bluetooth. Please use Chrome on Android or Edge on Windows.
        </div>
      )}
      
      {/* Connect/Reconnect button */}
      <button 
        className={`mb-6 px-4 py-2 rounded-md ${isConnected ? 'bg-blue-500' : 'bg-green-600'} text-white ${!isWebBluetoothSupported ? 'opacity-50 cursor-not-allowed' : ''}`} 
        onClick={isConnected ? reconnect : connect}
        disabled={!isWebBluetoothSupported}
      >
        {isConnected ? 'Reconnect' : 'Connect to Oximeter'}
      </button>
      
      {/* Readings display */}
      <div className="w-full max-w-xs mb-4 bg-white rounded-2xl shadow p-4 flex flex-col items-center">
        <span className={`text-xl font-mono ${spo2 > 95 ? "text-green-600" : "text-red-500"}`}>
          SpO₂: {spo2}%
        </span>
        <span className={`text-xl font-mono ${bpm > 50 ? "text-green-600" : "text-red-500"}`}>
          BPM: {bpm}
        </span>
        
        {/* Last reading timestamp */}
        {!isConnected && bpm !== "--" && lastReadingTime && (
          <span className="text-xs text-gray-500 mt-2">
            Last reading: {formatTimestamp(lastReadingTime)}
          </span>
        )}
      </div>
      
      {/* Pulse waveform chart */}
      <div className="w-full max-w-2xl">
        <Line
          data={{
            labels: waveform.map((_, i) => i),
            datasets: [
              {
                label: "PPG Waveform",
                data: waveform,
                fill: false,
                tension: 0.3,
                borderWidth: 2,
                borderColor: "#059669",
                backgroundColor: "#10b981",
              },
            ],
          }}
          options={{
            animation: false,
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { min: 20, max: 100, title: { display: true, text: "Amplitude" } },
              x: { display: false },
            },
          }}
        />
      </div>
      
      <p className="mt-4 text-sm text-gray-600">
        Make sure your BLE oximeter is powered on and nearby.
      </p>
      
      {/* Historical readings summary if available */}
      {historicalReadings.length > 0 && (
        <div className="mt-4 w-full max-w-xs bg-white rounded-md shadow p-3">
          <h3 className="text-sm font-semibold mb-2">Recent Readings</h3>
          <p className="text-xs text-gray-600">
            {historicalReadings.length} readings stored in the last 24 hours.
          </p>
        </div>
      )}
      
      {/* PWA installation button - shown only if not installed and install is available */}
      {displayInstallPrompt && !isInstalled && (
        <div className="mt-6 text-sm text-gray-700 p-3 bg-gray-100 rounded-md max-w-xs">
          <p className="mb-2 text-center">Install this app for the best offline experience:</p>
          <button 
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md"
            onClick={installApp}
          >
            Install App
          </button>
        </div>
      )}
      
      {/* App installed confirmation */}
      {isInstalled && (
        <div className="mt-6 text-sm text-green-700 p-2 bg-green-50 rounded-md max-w-xs text-center">
          App installed! You can use it offline anytime.
        </div>
      )}
    </div>
  );
}
