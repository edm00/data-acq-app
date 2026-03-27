import React, { useState, useEffect, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';

const PredictionPanel2 = ({ currentSensorData, isConnected, addLog }) => {
  const [baselineSet, setBaselineSet] = useState(false);
  const [baselineData, setBaselineData] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [predictionResult, setPredictionResult] = useState(null);
  const [error, setError] = useState(null);
  const [clicked, setClicked] = useState(0);
  const [baselineTimestamp, setBaselineTimestamp] = useState(null);
  
  // --- New State for Windowed Prediction ---
  const [predictionBuffer, setPredictionBuffer] = useState([]);
  const API_URL = "http://127.0.0.1:8000";

  // --- 1. Retrieve Baseline from Cookies ---
  useEffect(() => {
    const savedBaseline = Cookies.get('sensor_baseline');
    const savedTime = Cookies.get('baseline_timestamp');
    
    if (savedBaseline && savedTime) {
      const parsedBaseline = JSON.parse(savedBaseline);
      setBaselineData(parsedBaseline);
      setBaselineTimestamp(savedTime);
      syncBaselineWithBackend(parsedBaseline);
      addLog(`Restored baseline from ${savedTime}`);
      setBaselineSet(true);
      
    }
  }, []);

  const syncBaselineWithBackend = async (data) => {
    try {
      await fetch(`${API_URL}/set_baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      addLog("❌ Failed to sync baseline with backend.");
    }
  };

  // --- 2. Sampling & Countdown Logic ---
  useEffect(() => {
    let timer;
    if (isPredicting && countdown > 0) {
      // Capture a sample every time the second ticks
      captureSnapshot();
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (isPredicting && countdown === 0) {
      finalizeBestPrediction();
    }
    return () => clearTimeout(timer);
  }, [isPredicting, countdown]);

  // --- 3. Capture Single Snapshot ---
  const captureSnapshot = async () => {
    if (!isDataValid()) return;

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSensorData),
      });
      
      const data = await response.json();
      
      if (data.status_code == 400) {
        const baseline = Cookies.get("sensor_baseline") || JSON.stringify(baselineData);
        syncBaselineWithBackend(JSON.parse(baseline));
        console.log("baseline synced ",baseline);
        
        return;
      }

      // Add this prediction to our 5-second buffer
      setPredictionBuffer(prev => [...prev, data]);
      console.log("Sample captured:", data.prediction, data.confidence);
    } catch (err) {
      console.error("Sampling error:", err);
    }
  };

  // --- 4. Process the Buffer (Highest Confidence) ---
  const finalizeBestPrediction = () => {
    setIsPredicting(false);
    
    if (predictionBuffer.length === 0) {
      addLog("❌ No valid samples were captured.");
      setError("Sampling failed");
      return;
    }

    // Find the object with the highest confidence value
    const bestMatch = predictionBuffer.reduce((prev, current) => {
      const currentConf = parseFloat(current.confidence) || 0;
      const prevConf = parseFloat(prev.confidence) || 0;
      return currentConf > prevConf ? current : prev;
    });

    setPredictionResult(bestMatch);
    addLog(`🎯 Best of ${predictionBuffer.length} samples: ${bestMatch.prediction} (${bestMatch.confidence}%)`);
    setPredictionBuffer([]); // Clear for next run
  };

  const isDataValid = () => {
    if (!currentSensorData) return false;
    const values = Object.values(currentSensorData);
    return values.length === 10 && values.every(val => typeof val === 'number' && !isNaN(val));
  };

  const fixBaseline = async () => {
    if (!isDataValid()) {
      addLog("⚠️ Cannot set baseline: Waiting for valid data...");
      return;
    }
    const timestamp = new Date().toLocaleString();

    try {
      const res = await fetch(`${API_URL}/set_baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSensorData),
      });
      
      if (res.ok) {
        setBaselineData(currentSensorData);
        setBaselineTimestamp(timestamp);
        Cookies.set('sensor_baseline', JSON.stringify(currentSensorData), { expires: 7 });
        Cookies.set('baseline_timestamp', timestamp, { expires: 7 });
        setBaselineSet(true);
        addLog(`✅ New baseline saved at ${timestamp}`);
      }
    } catch (err) {
      addLog("❌ Error saving baseline.");
    }
  };

  const startPredictionCycle = () => {
    if (!baselineSet) {
      alert("Please fix baseline in clean air first!");
      return;
    }
    setIsPredicting(true);
    setCountdown(10); // Changed to 5 seconds for your requirement
    setPredictionBuffer([]); // Reset buffer
    setPredictionResult(null);
    setError(null);
    addLog("⏱️ Sampling started. Collecting 5 seconds of data...");
  };

  const dataReady = isDataValid() && isConnected;

  // JSX rendering logic follows here...
  
  return (
    <div style={{ 
      background: '#eef2f7', 
      padding: '20px', 
      borderRadius: '8px', 
      border: '2px solid #3498db',
      marginTop: '20px' 
    }}>
      <h3 style={{ marginTop: 0 }}> AI Prediction </h3>

      {baselineTimestamp && (
          <span style={{ fontSize: '0.75rem', color: '#7f8c8d' }}>
            Last Calibrated: <strong>{baselineTimestamp}</strong>
          </span>
        )}

      {!dataReady && isConnected && (
        <p style={{ color: '#e67e22', fontSize: '0.85rem' }}>⌛ Waiting for stable sensor readings...</p>
      )}

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <button 
          onClick={fixBaseline}
          disabled={!isConnected || isPredicting}
          style={{
            padding: '10px 15px',
            backgroundColor: baselineSet ? '#2ecc71' : '#f39c12',
            color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
          }}
        >
          {baselineSet ? "✓ Update Baseline" : "1. Fix Baseline (Clean Air)"}
        </button>

        <button 
          onClick={startPredictionCycle}
          disabled={!isConnected || !baselineSet || isPredicting}
          style={{
            padding: '10px 15px',
            backgroundColor: '#3498db',
            color: 'white', border: 'none', borderRadius: '4px',
            cursor: (!isConnected || !baselineSet) ? 'not-allowed' : 'pointer',
            opacity: (!isConnected || !baselineSet) ? 0.6 : 1
          }}
        >
          {isPredicting ? `Sampling... (${countdown}s)` : `2. Start ${countdown}s Prediction`}
        </button>
      </div>
      <div>
        {error && <p style={{backgroundColor:"#ebaaaa"

        }}>{error}</p>}
      </div>
      {predictionResult && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#fff', 
          borderRadius: '5px',
          borderLeft: '5px solid #2ecc71' 
        }}>
          <strong>Result:</strong> 
          <span style={{ fontSize: '1.4em', marginLeft: '10px', color: '#2c3e50' }}>
            {parseInt(predictionResult.confidence,10)>50 ? predictionResult.prediction.toUpperCase():"Unknown" }
          </span>
          <span style={{ marginLeft: '15px', color: '#7f8c8d' }}>
            Confidence: {parseInt(predictionResult.confidence,10)>50 ?predictionResult.confidence:""}
          </span>
        </div>
      )}
    </div>
  );
};

export default PredictionPanel2;