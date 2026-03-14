import React, { useState, useEffect, useCallback } from 'react';

const PredictionPanel = ({ currentSensorData, isConnected, addLog }) => {
  const [baselineSet, setBaselineSet] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [predictionResult, setPredictionResult] = useState(null);
  const [error, setError] = useState(null);
  const [clicked,setClicked] = useState(0)
  const API_URL = "http://127.0.0.1:8000";

  // Handle the 30-second countdown logic
  useEffect(() => {
    let timer;
    if (isPredicting && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isPredicting && countdown === 0) {
      sendPredictionRequest();
    }
    return () => clearTimeout(timer);
  }, [isPredicting, countdown]);

  useEffect(()=>{
    if(isConnected && baselineSet){
      console.log(error);
      
       setError(null)
    }
      
  },[baselineSet,clicked]);

// --- Helper: Check if all sensor values are valid numbers ---
  const isDataValid = () => {
    if (!currentSensorData) return false;
    const values = Object.values(currentSensorData);
    // Ensure we have all 10 fields and none of them are NaN or Infinity
    return values.length === 10 && values.every(val => typeof val === 'number' && !isNaN(val));
  };

  const fixBaseline = async () => {
    if (!isDataValid()) {
      addLog("⚠️ Cannot set baseline: Waiting for valid sensor data...");
      return;
    }

    const res = fetch(`${API_URL}/set_baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSensorData),
      }).then(res=> {if (res.ok) {
        setBaselineSet(true);
        setClicked((prev)=>{
          return prev+1
        });
        addLog("✅ Baseline fixed successfully.");
        
        return res.json();
      } else {
         throw new Error(`HTTP error! Status: ${res.status}`);
      }
    }).then(data=>{
      console.log("success",data);
      
    })
    
  };

  const startPredictionCycle = () => {
    if (!baselineSet) {
      alert("Please fix baseline in clean air first!");
      return;
    }
    if (!isDataValid()) {
      addLog("⚠️ Cannot predict: Sensor data is currently invalid.");
      return;
    }
    setIsPredicting(true);
    setCountdown(10);
    setPredictionResult(null);
    addLog("⏱️ Prediction started. Expose sensors to sample now...");
  };

  const sendPredictionRequest = useCallback( async () => {
    setIsPredicting(false);
    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSensorData),
      });
      const data = await response.json();
      console.log("result",data,data.confidence,typeof(data.confidence),parseInt(data.confidence,10));
      
      setPredictionResult(data);
      addLog(`🎯 Prediction Received: ${data.prediction} (${data.confidence || ''})`);
    } catch (err) {
      addLog("❌ API Error: Prediction request failed.");
      setError("Failed to reach API");
    }
  },[currentSensorData, addLog]);

  const dataReady = isDataValid() && isConnected;
  return (
    <div style={{ 
      background: '#eef2f7', 
      padding: '20px', 
      borderRadius: '8px', 
      border: '2px solid #3498db',
      marginTop: '20px' 
    }}>
      <h3 style={{ marginTop: 0 }}> AI Prediction </h3>

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
          {baselineSet ? "✓ Baseline Set" : "1. Fix Baseline (Clean Air)"}
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
            Confidence: {predictionResult.confidence}
          </span>
        </div>
      )}
    </div>
  );
};

export default PredictionPanel;