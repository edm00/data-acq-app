import logo from './logo.svg';
import './App.css';
import ArduinoSensorCollector from './ArduinoSensorCollector';
import ArduinoDataCollector from './ArduinoDataCollector';

function App() {
  return (
    <div className="App">
    <ArduinoSensorCollector />
    {/* <ArduinoDataCollector /> */}
    </div>
  );
}

export default App;
