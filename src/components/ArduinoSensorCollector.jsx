
import React, { useState, useRef, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import PredictionPanel from './PredictionPanel';
import Cookies from 'js-cookie';
import PredictionPanel2 from './PredictionPanel2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ArduinoSensorCollector = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sensorData, setSensorData] = useState({
    sensor1: '--',
    sensor2: '--',
    sensor3: '--',
    sensor4: '--',
    sensor5: '--',
    sensor6: '--',
    sensor7: '--',
    sensor8: '--',
    temperature: '--',
    humidity: '--'
  });
  const [settings, setSettings] = useState({
    filename: 'sensor_data',
    sampleName: '',
    duration: 10,
    baudRate: 9600,
    temp: 23.0,
    humidity: 31.5
  });
  const [recordedData, setRecordedData] = useState([]);
  const [log, setLog] = useState(['Application started. Click Connect to begin.']);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: []
  });

  useEffect(() => {
    if (isConnected) {
      readData();
    }
  }, [isConnected]);


  const portRef = useRef(null);
  const readerRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const dataBufferRef = useRef('');
  const dataIndexRef = useRef(0);
  const settingsRef = useRef(settings);

  // Keep settingsRef updated
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect( ()=>{
    if(!recordingTimeoutRef.current)
       downloadCSV();
  
  },[recordingTimeoutRef.current])

  // Chart colors for all sensors
  const sensorColors = [
    { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.2)' },
    { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.2)' },
    { border: 'rgb(255, 205, 86)', background: 'rgba(255, 205, 86, 0.2)' },
    { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.2)' },
    { border: 'rgb(153, 102, 255)', background: 'rgba(153, 102, 255, 0.2)' },
    { border: 'rgb(255, 159, 64)', background: 'rgba(255, 159, 64, 0.2)' },
    { border: 'rgb(201, 203, 207)', background: 'rgba(201, 203, 207, 0.2)' },
    { border: 'rgb(255, 0, 0)', background: 'rgba(255, 0, 0, 0.2)' },
    { border: 'rgb(0, 128, 0)', background: 'rgba(0, 128, 0, 0.2)' },
    { border: 'rgb(0, 0, 255)', background: 'rgba(0, 0, 255, 0.2)' }
  ];

  // Initialize chart datasets with 300-point window
  useEffect(() => {
    const datasets = [
      'Sensor 1', 'Sensor 2', 'Sensor 3', 'Sensor 4', 
      'Sensor 5', 'Sensor 6', 'Sensor 7', 'Sensor 8',
      'Temperature', 'Humidity'
    ].map((label, index) => ({
      label,
      data: Array(300).fill(null),
      borderColor: sensorColors[index].border,
      backgroundColor: sensorColors[index].background,
      tension: 0.1,
      borderWidth: 1.5,
      pointRadius: 0,
      yAxisID: index >= 8 ? 'y1' : 'y'
    }));

    // Create labels as index numbers 0-299
    const labels = Array.from({ length: 300 }, (_, i) => i.toString());

    setChartData({
      labels,
      datasets
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      disconnectFromSerial();
    };
  }, []);

  // Record data when isRecording changes
  useEffect(() => {
    if (isRecording && sensorData.sensor1 !== '--') {
      const timestamp = new Date().toLocaleTimeString();
      const dataEntry = {
        timestamp: timestamp,
        datetime: new Date().toISOString(),
        ...sensorData
      };
      
      setRecordedData(prev => [...prev, dataEntry]);
    }
  }, [isRecording, sensorData]);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog(prev => [...prev.slice(-50), `[${timestamp}] ${message}`]);
  };

  const connectToSerial = async () => {
    try {
      if (!navigator.serial) {
        addLog('Error: Web Serial API not supported in this browser. Use Chrome or Edge.');
        return;
      }

      addLog('Requesting serial port...');
      const port = await navigator.serial.requestPort();
      addLog('Port selected, opening connection...');
      
      await port.open({ 
        baudRate: settings.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });
      
      addLog(`Connected at ${settings.baudRate} baud`);

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      
      portRef.current = port;
      readerRef.current = reader;
      dataBufferRef.current = '';
      setIsConnected(true);
      
      // Start reading data immediately after connection
      readData();
      
    } catch (error) {
      console.error('Connection error:', error);
      addLog(`Connection error: ${error.message}`);
    }
  };

  const disconnectFromSerial = async () => {
    try {
      if (readerRef.current) {
        console.log("reader",readerRef.current);
        
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        console.log("port",readerRef.current);

        await portRef.current.close();
        portRef.current = null;
      }
      setIsConnected(false);
      setIsRecording(false);
      dataBufferRef.current = '';
      addLog('Disconnected from serial port');
    } catch (error) {
      console.error('Disconnection error:', error);
    }
  };

  const readData = async () => {
    try {
      while (isConnected && readerRef.current) {
        const { value, done } = await readerRef.current.read();
        if (done) {
          addLog('Reader disconnected');
          break;
        }
        
        if (value) {
          processSensorData(value);
        }
      }
    } catch (error) {
      console.error('Read error:', error);
      if (error.name !== 'InterruptedError') {
        addLog(`Read error: ${error.message}`);
      }
    }
  };

  const processSensorData = (data) => {
    dataBufferRef.current += data;
    
    const lines = dataBufferRef.current.split('\n');
    
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          processCompleteLine(line);
        }
      }
      
      dataBufferRef.current = lines[lines.length - 1];
    }
  };

  const processCompleteLine = (line) => {
    const cleanLine = line.replace(/\r/g, '').trim();
    const values = cleanLine.split(',').map(val => val.trim()).filter(val => val !== '');
    
    // update temp and humidity from settings from ref
    let settings = settingsRef.current;
    
    if (values.length === 8) {
      const newData = {
        sensor1: parseFloat(values[0]) || values[0],
        sensor2: parseFloat(values[1]) || values[1],
        sensor3: parseFloat(values[2]) || values[2],
        sensor4: parseFloat(values[3]) || values[3],
        sensor5: parseFloat(values[4]) || values[4],
        sensor6: parseFloat(values[5]) || values[5],
        sensor7: parseFloat(values[6]) || values[6],
        sensor8: parseFloat(values[7]) || values[7],
        temperature: settings.temp,
        humidity: settings.humidity
      };
      
      setSensorData(newData);
      
      // Update chart with rolling window of 300 points
      setChartData(prev => {
        const currentIndex = dataIndexRef.current % 300;
        
        const newDatasets = prev.datasets.map((dataset, index) => {
          const sensorValues = [
            newData.sensor1, newData.sensor2, newData.sensor3, newData.sensor4,
            newData.sensor5, newData.sensor6, newData.sensor7, newData.sensor8,
            newData.temperature, newData.humidity
          ];
          
          // Create a new data array and update the current position
          const newDataArray = [...dataset.data];
          newDataArray[currentIndex] = sensorValues[index];
          
          return {
            ...dataset,
            data: newDataArray
          };
        });
        
        return {
          ...prev,
          datasets: newDatasets
        };
      });
      
      // Increment the data index
      dataIndexRef.current = (dataIndexRef.current + 1) % 300;
      
    } else if (values.length > 0) {
      addLog(`Invalid data format. Expected 8 values, got ${values.length}`);
    }
  };

const getNumericSensorData = () => {
    const cleaned = {};
    Object.keys(sensorData).forEach(key => {
        cleaned[key] = sensorData[key] === '--' ? NaN : parseFloat(sensorData[key]);
    });
    return cleaned;
};

  const startRecording = () => {
    setRecordedData([]);
    dataIndexRef.current = 0;
    
    // Reset chart data but maintain the 300-point window structure
    setChartData(prev => ({
      labels: prev.labels,
      datasets: prev.datasets.map(dataset => ({
        ...dataset,
        data: Array(300).fill(null)
      }))
    }));
    
    setIsRecording(true);
    
    addLog(`Started recording - will stop after ${settings.duration} seconds`);
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    recordingTimeoutRef.current = setTimeout(() => {
      stopRecording();
      addLog('Auto-stop: Recording duration completed');
      console.log("Data saved ! and downloaded ", recordedData);
      // save data as json
    }, settings.duration * 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    addLog(`Stopped recording - collected ${recordedData.length} data points`);
  };

  const syncData = async (rData)=>{
    // --- NEW BACKEND SYNC LOGIC ---
  addLog("📤 Syncing data to backend folder...");
  try {
    const baseline = JSON.parse(Cookies.get('sensor_baseline') || '{}');
    await fetch("http://127.0.0.1:8000/upload_session", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: rData,
        baseline: baseline,
        sampleName: settings.sampleName
      }),
    }).then(res=>res.json()).then(d=>console.log(d)
    );
    addLog("✅ Data saved and processed in /backend_data");
  } catch (err) {
    addLog("❌ Backend sync failed. Only local download completed.");
  }
  };
  
  const downloadCSV = async () => {
    if (recordedData.length === 0) {
      addLog('No data to download');
      return;
    }
    
    const headers = 'Timestamp,DateTime,Sensor1,Sensor2,Sensor3,Sensor4,Sensor5,Sensor6,Sensor7,Sensor8,Temperature,Humidity,Sample\n';
    const csvContent = recordedData.map(data => 
      `${data.timestamp},${data.datetime},${data.sensor1},${data.sensor2},${data.sensor3},${data.sensor4},${data.sensor5},${data.sensor6},${data.sensor7},${data.sensor8},${data.temperature},${data.humidity},${settings.sampleName || 'Unknown'}`
    ).join('\n');
    
    const blob = new Blob([headers + csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.filename}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    await syncData(recordedData);
    
    
    addLog(`Downloaded ${recordedData.length} data points as CSV`);
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time (Seconds)'
        },
        ticks: {
          callback: function(value) {
            return value + 's';
          }
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Sensors 1-8'
        },
        grid: {
          drawOnChartArea: true,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Temperature (°C) & Humidity (%)'
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          font: {
            size: 10
          }
        }
      },
      title: {
        display: true,
        text: 'Sensor Values - Live (300s Window)'
      },
    },
    elements: {
      point: {
        radius: 0
      }
    },
    animation: {
      duration: 0
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#2c3e50', marginBottom: '10px' }}>E-Nose Sensor Data Collector</h1>
      
      {/* Control Panel */}
      <div style={{ 
        background: '#f8f9fa', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        border: '1px solid #dee2e6'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>File Name:</label>
            <input 
              type="text" 
              value={settings.filename}
              onChange={(e) => handleSettingChange('filename', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sample Name:</label>
            <input 
              type="text" 
              value={settings.sampleName}
              onChange={(e) => handleSettingChange('sampleName', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              placeholder="Enter sample identifier"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Duration (sec):</label>
            <input 
              type="number" 
              value={settings.duration}
              onChange={(e) => handleSettingChange('duration', parseInt(e.target.value) || 10)}
              min="10"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Baud Rate:</label>
            <select 
              value={settings.baudRate}
              onChange={(e) => handleSettingChange('baudRate', parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Temp:</label>
            <input 
              type="number" 
              value={settings.temp}
              onChange={(e) => handleSettingChange('temp', parseFloat(e.target.value) )}
              min="1"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Humidity:</label>
            <input 
              type="number" 
              value={settings.humidity}
              onChange={(e) => handleSettingChange('humidity', parseFloat(e.target.value))}
              min="1"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
          <button 
            onClick={connectToSerial} 
            disabled={isConnected}
            style={{ 
              padding: '10px 20px', 
              background: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: isConnected ? 'not-allowed' : 'pointer',
              opacity: isConnected ? 0.6 : 1
            }}
          >
            Connect
          </button>
          <button 
            onClick={disconnectFromSerial} 
            disabled={!isConnected}
            style={{ 
              padding: '10px 20px', 
              background: '#dc3545', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: !isConnected ? 'not-allowed' : 'pointer',
              opacity: !isConnected ? 0.6 : 1
            }}
          >
            Disconnect
          </button>
          <button 
            onClick={startRecording} 
            disabled={!isConnected || isRecording}
            style={{ 
              padding: '10px 20px', 
              background: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: (!isConnected || isRecording) ? 'not-allowed' : 'pointer',
              opacity: (!isConnected || isRecording) ? 0.6 : 1
            }}
          >
            Start Recording
          </button>
          <button 
            onClick={stopRecording} 
            disabled={!isRecording}
            style={{ 
              padding: '10px 20px', 
              background: '#ffc107', 
              color: 'black', 
              border: 'none', 
              borderRadius: '4px',
              cursor: !isRecording ? 'not-allowed' : 'pointer',
              opacity: !isRecording ? 0.6 : 1
            }}
          >
            Stop Recording
          </button>
          <button 
            onClick={downloadCSV} 
            disabled={recordedData.length === 0}
            style={{ 
              padding: '10px 20px', 
              background: '#6f42c1', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: recordedData.length === 0 ? 'not-allowed' : 'pointer',
              opacity: recordedData.length === 0 ? 0.6 : 1
            }}
          >
            Download CSV
          </button>

          
        </div>
        
        <div style={{ 
          padding: '10px', 
          background: isConnected ? '#d4edda' : '#f8d7da',
          color: isConnected ? '#155724' : '#721c24',
          borderRadius: '4px',
          fontWeight: 'bold',
          border: `1px solid ${isConnected ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          Status: {isConnected ? 'Connected' : 'Disconnected'} {isRecording && '| Recording'}
        </div>
      </div>

      {/* Sensor Readings */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
        gap: '15px', 
        marginBottom: '20px' 
      }}>
        {Object.entries(sensorData).map(([key, value]) => (
          <div key={key} style={{ 
            background: 'white', 
            padding: '15px', 
            borderRadius: '8px', 
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ fontSize: '0.9em', color: '#6c757d', marginBottom: '5px' }}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </div>
            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#495057' }}>
              {value} {key === 'temperature' ? '°C' : key === 'humidity' ? '%' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        height: '500px',
        border: '1px solid #e9ecef'
      }}>
        <Line data={chartData} options={chartOptions} />
      </div>


            {/* New Prediction Panel */}
        {/* <PredictionPanel 
            currentSensorData={getNumericSensorData()} 
            isConnected={isConnected} 
            addLog={addLog} 
        /> */}
     <PredictionPanel2

            currentSensorData={getNumericSensorData()} 
            isConnected={isConnected} 
            addLog={addLog}
     
     />

      {/* Log */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        border: '1px solid #e9ecef'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#495057' }}>Activity Log</h3>
        <div style={{ 
          height: '150px', 
          overflowY: 'auto', 
          background: '#f8f9fa', 
          padding: '15px', 
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.9em'
        }}>
          {log.map((entry, index) => (
            <div key={index} style={{ marginBottom: '5px', paddingBottom: '5px', borderBottom: '1px solid #dee2e6' }}>
              {entry}
            </div>
          ))}
        </div>
      </div>

      {/* Data Table */}
      {recordedData.length > 0 && (
        <div style={{ 
          background: 'white', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ marginBottom: '15px', color: '#495057' }}>
            Recorded Data ({recordedData.length} points)
          </h3>
          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8em' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Temp</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Humidity</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S1</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S2</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S3</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S4</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S5</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S6</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S7</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>S8</th>
                </tr>
              </thead>
              <tbody>
                {recordedData.slice(-10).reverse().map((data, index) => (
                  <tr key={index} style={{ background: index % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.timestamp}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.temperature}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.humidity}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor1}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor2}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor3}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor4}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor5}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor6}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor7}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{data.sensor8}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArduinoSensorCollector;