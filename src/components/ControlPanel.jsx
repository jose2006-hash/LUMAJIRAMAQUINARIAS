import { useState, useEffect } from 'react';
import { ref, push, onValue } from 'firebase/database';
import { rtdb } from '../firebase/config';

export default function ControlPanel({ machineId }) {
  const [targetTemp, setTargetTemp] = useState(220);
  const [injectionSpeed, setInjectionSpeed] = useState(50);
  const [rotationSpeed, setRotationSpeed] = useState(30);
  const [machineStatus, setMachineStatus] = useState(null);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastCommand, setLastCommand] = useState('');

  useEffect(() => {
    if (!machineId) return;
    const statusRef = ref(rtdb, `machines/${machineId}/status`);
    const unsub = onValue(statusRef, (snap) => {
      const data = snap.val();
      if (data) {
        setMachineStatus(data);
        setEmergencyStop(data.emergencyStop || false);
      }
    });
    return () => unsub();
  }, [machineId]);

  async function sendCommand(type, params = {}) {
    if (!machineId || emergencyStop) return;
    setIsSending(true);
    try {
      const commandsRef = ref(rtdb, `machines/${machineId}/commands`);
      await push(commandsRef, {
        type,
        params,
        timestamp: Date.now(),
      });
      setLastCommand(type);
      setTimeout(() => setLastCommand(''), 2000);
    } catch (err) {
      console.error('Error sending command:', err);
    }
    setIsSending(false);
  }

  async function handleEmergencyStop() {
    await sendCommand('emergencyStop');
  }

  async function handleResetEmergency() {
    await sendCommand('emergencyReset');
  }

  async function handleSetTemperature() {
    await sendCommand('setTemp', { targetTemp: parseFloat(targetTemp) });
  }

  async function handleInject() {
    await sendCommand('inject', { speed: parseInt(injectionSpeed) });
  }

  async function handleRotate() {
    await sendCommand('rotate', { speed: parseInt(rotationSpeed) });
  }

  async function handleStop() {
    await sendCommand('stop');
  }

  const getStateColor = (state) => {
    switch (state) {
      case 'idle': return '#378add';
      case 'heating': return '#ef9f27';
      case 'injecting': return '#0f6e56';
      case 'cooling': return '#5a8fc4';
      case 'error': return '#e24b4a';
      default: return '#5a8fc4';
    }
  };

  const getStateLabel = (state) => {
    switch (state) {
      case 'idle': return 'INACTIVO';
      case 'heating': return 'CALENTANDO';
      case 'injecting': return 'INYECTANDO';
      case 'cooling': return 'ENFRIANDO';
      case 'error': return 'ERROR';
      default: return 'DESCONOCIDO';
    }
  };

  return (
    <div style={{
      background: '#0a1628',
      border: '1px solid #1d4e8f',
      borderRadius: '16px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
    }}>
      <h2 style={{ color: '#fff', margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>🎮</span> Panel de Control
      </h2>

      {/* Emergency Stop */}
      <div style={{
        background: emergencyStop ? '#2a0a0a' : '#0a1628',
        border: `1px solid ${emergencyStop ? '#e24b4a' : '#1d4e8f'}`,
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#5a8fc4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Paro de Emergencia
          </div>
          <div style={{ fontSize: '1rem', fontWeight: '600', color: emergencyStop ? '#e24b4a' : '#5dcaa5', marginTop: '0.25rem' }}>
            {emergencyStop ? 'ACTIVADO' : 'DESACTIVADO'}
          </div>
        </div>
        {emergencyStop ? (
          <button onClick={handleResetEmergency} style={{
            background: '#0f6e56',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            padding: '0.6rem 1.2rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
          }}>
            Restablecer
          </button>
        ) : (
          <button onClick={handleEmergencyStop} style={{
            background: '#e24b4a',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            padding: '0.6rem 1.2rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
            minWidth: '120px',
          }}>
            🛑 PARAR
          </button>
        )}
      </div>

      {/* Machine Status */}
      {machineStatus && (
        <div style={{
          background: '#070f1e',
          border: '1px solid #1d4e8f',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5a8fc4', textTransform: 'uppercase' }}>Estado</div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: getStateColor(machineStatus.state), marginTop: '0.2rem' }}>
              {getStateLabel(machineStatus.state)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5a8fc4', textTransform: 'uppercase' }}>Temp Actual</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ef9f27', marginTop: '0.2rem' }}>
              {machineStatus.currentTemp?.toFixed(1) || '—'}°C
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5a8fc4', textTransform: 'uppercase' }}>Temp Objetivo</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#378add', marginTop: '0.2rem' }}>
              {machineStatus.targetTemp?.toFixed(0) || '—'}°C
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#5a8fc4', textTransform: 'uppercase' }}>Vel. Inyección</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#5dcaa5', marginTop: '0.2rem' }}>
              {machineStatus.injectionSpeed || '—'}
            </div>
          </div>
        </div>
      )}

      {/* Temperature Control */}
      <div style={{
        background: '#070f1e',
        border: '1px solid #1d4e8f',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.75rem', color: '#5a8fc4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          🌡️ Control de Temperatura
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            value={targetTemp}
            onChange={(e) => setTargetTemp(e.target.value)}
            min="100"
            max="260"
            style={{
              flex: '1',
              minWidth: '100px',
              background: '#0a1628',
              border: '1px solid #1d4e8f',
              borderRadius: '8px',
              padding: '0.6rem 1rem',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          <span style={{ color: '#5a8fc4' }}>°C</span>
          <button onClick={handleSetTemperature} disabled={isSending || emergencyStop} style={{
            background: '#1d4e8f',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            padding: '0.6rem 1.2rem',
            cursor: isSending || emergencyStop ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            opacity: isSending || emergencyStop ? 0.5 : 1,
          }}>
            {isSending ? 'Enviando...' : 'Aplicar'}
          </button>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#5a8fc4' }}>
          PP: 200-230°C recomendado
        </div>
      </div>

      {/* Motor Controls */}
      <div style={{
        background: '#070f1e',
        border: '1px solid #1d4e8f',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.75rem', color: '#5a8fc4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          ⚙️ Control de Motores
        </div>

        {/* Injection Motor */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#5a8fc4', marginBottom: '0.5rem' }}>Motor Inyección</div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="range"
              min="10"
              max="100"
              value={injectionSpeed}
              onChange={(e) => setInjectionSpeed(e.target.value)}
              style={{ flex: '1', minWidth: '150px' }}
            />
            <span style={{ color: '#fff', fontWeight: '600', minWidth: '40px' }}>{injectionSpeed}</span>
            <button onClick={handleInject} disabled={isSending || emergencyStop || machineStatus?.state === 'heating'} style={{
              background: '#0f6e56',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '0.5rem 1rem',
              cursor: isSending || emergencyStop || machineStatus?.state === 'heating' ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: isSending || emergencyStop || machineStatus?.state === 'heating' ? 0.5 : 1,
            }}>
              Inyectar
            </button>
          </div>
        </div>

        {/* Rotation Motor */}
        <div>
          <div style={{ fontSize: '0.8rem', color: '#5a8fc4', marginBottom: '0.5rem' }}>Motor Rotación</div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="range"
              min="10"
              max="80"
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(e.target.value)}
              style={{ flex: '1', minWidth: '150px' }}
            />
            <span style={{ color: '#fff', fontWeight: '600', minWidth: '40px' }}>{rotationSpeed}</span>
            <button onClick={handleRotate} disabled={isSending || emergencyStop} style={{
              background: '#1d4e8f',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '0.5rem 1rem',
              cursor: isSending || emergencyStop ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: isSending || emergencyStop ? 0.5 : 1,
            }}>
              Rotar
            </button>
          </div>
        </div>
      </div>

      {/* Stop Button */}
      <button onClick={handleStop} disabled={isSending || emergencyStop} style={{
        width: '100%',
        background: '#854f0b',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        padding: '1rem',
        cursor: isSending || emergencyStop ? 'not-allowed' : 'pointer',
        fontWeight: '700',
        fontSize: '1rem',
        opacity: isSending || emergencyStop ? 0.5 : 1,
      }}>
        ⏹️ Detener Todo
      </button>

      {/* Last Command Feedback */}
      {lastCommand && (
        <div style={{
          marginTop: '0.75rem',
          background: '#071a12',
          border: '1px solid #0f6e56',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          textAlign: 'center',
          color: '#5dcaa5',
          fontSize: '0.85rem',
        }}>
          ✓ Comando "{lastCommand}" enviado correctamente
        </div>
      )}
    </div>
  );
}
