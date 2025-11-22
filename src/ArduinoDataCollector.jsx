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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ArduinoDataCollector = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [temp,setTemp] = useState("--");
  const [hum,setHum]= useState("--");
  const [sensorData, setSensorData] = useState({
    sensor1: '--',
    sensor2: '--',
    sensor3: '--',
    sensor4: '--',
    sensor5: '--',
    sensor6: '--',
    sensor7: '--',
    sensor8: '--',
    temperature: temp,
    humidity: hum
  });
  const [settings, setSettings] = useState({
    filename: 'sensor_data',
    sampleName: '',
    duration: 5,
    baudRate: 9600
  });


  const [recordedData, setRecordedData] = useState([]);
  const [log, setLog] = useState(['Application started. Click Connect to begin.']);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Temperature',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.4,
      },
      {
        label: 'Humidity',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        tension: 0.4,
      }
    ]
  });

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const dataBufferRef = useRef(''); // Buffer for incomplete data

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      disconnectFromSerial();
    };
  }, []);

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
      dataBufferRef.current = ''; // Clear buffer on new connection
      setIsConnected(true);
      
    //   // Start reading data
      readData();
      
    } catch (error) {
      console.error('Connection error:', error);
      addLog(`Connection error: ${error.message}`);
    }
  };

  const disconnectFromSerial = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
      setIsConnected(false);
      setIsRecording(false);
      dataBufferRef.current = ''; // Clear buffer on disconnect
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
    // Add new data to buffer
    dataBufferRef.current += data;
    
    // Split buffer by newlines to find complete lines
    const lines = dataBufferRef.current.split('\n');
    
    // If we have at least one complete line (last element is empty or incomplete)
    if (lines.length > 1) {
      // Process all complete lines (all except the last one)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          processCompleteLine(line);
        }
      }
      
      // Keep the last (possibly incomplete) line in the buffer
      dataBufferRef.current = lines[lines.length - 1];
    }
  };

  const processCompleteLine = (line) => {
    // Remove any carriage returns
    const cleanLine = line.replace(/\r/g, '').trim();
    
    // Split by comma and filter out empty values
    const values = cleanLine.split(',').map(val => val.trim()).filter(val => val !== '');
    
    // console.log('Received complete line:', values);
    
    // Check if we have exactly 10 values
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
        temperature: 21.5,
        humidity: 35.2
      };
      
      setSensorData(newData);
    //   addLog(`Data received: Temp=${newData.temperature}°C, Humidity=${newData.humidity}%`);
         addLog(`Data received: ${cleanLine}`);
         console.log(isRecording);
      
      if (isRecording) {
        const timestamp = new Date();
        const dataEntry = {
          timestamp: timestamp.toLocaleTimeString(),
          datetime: timestamp.toISOString(),
          ...newData
        };
        
        setRecordedData(prev => [...prev, dataEntry]);
        
        // Update chart (keep last 50 points)
        setChartData(prev => ({
          labels: [...prev.labels.slice(-49), dataEntry.timestamp],
          datasets: [
            {
              ...prev.datasets[0],
              data: [...prev.datasets[0].data.slice(-49), newData.temperature]
            },
            {
              ...prev.datasets[1],
              data: [...prev.datasets[1].data.slice(-49), newData.humidity]
            }
          ]
        }));
        console.log("recoreded data ",recordedData);
        
      }
    } else if (values.length > 0) {
      addLog(`Invalid data format. Expected 10 values, got ${values.length}: ${cleanLine}`);
      console.log('Raw values:', values);
    }
  };

  const startRecording = () => {
    setRecordedData([]);
    setChartData({
      labels: [],
      datasets: [
        {
          label: 'Temperature',
          data: [],
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.4,
        },
        {
          label: 'Humidity',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4,
        }
      ]
    });
    setIsRecording(true);
    
    addLog(`Started recording - will stop after ${settings.duration} minutes`);
    
    readData();
    // Auto stop after duration
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    recordingTimeoutRef.current = setTimeout(() => {
      stopRecording();
      addLog('Auto-stop: Recording duration completed');
    }, settings.duration * 60 * 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    addLog(`Stopped recording - collected ${recordedData.length} data points`);
  };

  const downloadCSV = () => {
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
    a.download = `${settings.filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
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
          text: 'Time'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Temperature (°C) / Humidity (%)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Temperature & Humidity Over Time'
      },
    },
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#2c3e50', marginBottom: '10px' }}>Arduino Sensor Data Collector</h1>
      
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
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Duration (min):</label>
            <input 
              type="number" 
              value={settings.duration}
              onChange={(e) => handleSettingChange('duration', parseInt(e.target.value) || 10)}
              min="1"
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
        height: '400px',
        border: '1px solid #e9ecef'
      }}>
        <Line data={chartData} options={chartOptions} />
      </div>

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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Temp</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Humidity</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Sensor 1</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Sensor 2</th>
                  <th style={{ padding: '10px', border: '1px solid #dee2e6', textAlign: 'left' }}>Sensor 3</th>
                </tr>
              </thead>
              <tbody>
                {recordedData.slice(-10).reverse().map((data, index) => (
                  <tr key={index} style={{ background: index % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.timestamp}</td>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.temperature}</td>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.humidity}</td>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.sensor1}</td>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.sensor2}</td>
                    <td style={{ padding: '10px', border: '1px solid #dee2e6' }}>{data.sensor3}</td>
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

export default ArduinoDataCollector;