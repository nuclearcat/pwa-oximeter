import React, { useState, useRef } from "react";
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
  const waveformBuf = useRef([]);

  const connect = async () => {
    try {
      // 1. Request device
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ["0000fee0-0000-1000-8000-00805f9b34fb"] }],
        optionalServices: ["0000fee0-0000-1000-8000-00805f9b34fb"],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(
        "0000fee0-0000-1000-8000-00805f9b34fb"
      );
      // 2. Find notify characteristic
      const chars = await service.getCharacteristics();
      const notifyChar = chars.find((c) => c.properties.notify);

      if (!notifyChar) throw new Error("Notify characteristic not found.");

      // 3. Notification handler
      await notifyChar.startNotifications();
      notifyChar.addEventListener("characteristicvaluechanged", (event) => {
        const result = bufferToSamples(event.target.value);
        if (!result) return;
        if (result.type === "measure") {
          setBpm(result.bpm);
          setSpo2(result.spo2);
        } else if (result.type === "waveform") {
          waveformBuf.current = [
            ...waveformBuf.current.slice(-200 + result.samples.length),
            ...result.samples,
          ];
          setWaveform([...waveformBuf.current]);
        }
      });
    } catch (e) {
      alert("Connection failed: " + e);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold my-2">Oximeter PWA</h1>
<button className="mb-6" onClick={connect}>
  Connect to Oximeter
</button>
<div className="w-full max-w-xs mb-4 bg-white rounded-2xl shadow p-4 flex flex-col items-center">
  <span className={`text-xl font-mono ${spo2 > 95 ? "text-green-600" : "text-red-500"}`}>
    SpO₂: {spo2}%
  </span>
  <span className={`text-xl font-mono ${bpm > 50 ? "text-green-600" : "text-red-500"}`}>
    BPM: {bpm}
  </span>
</div>
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
    </div>
  );
}
