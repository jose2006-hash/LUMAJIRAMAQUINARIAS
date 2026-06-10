import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { rtdb, db } from '../firebase/config';
import { analyzeCurrentReading, predictiveMaintenance } from '../utils/alerts';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [currentStatus, setCurrentStatus] = useState(null);

  useEffect(() => {
    loadMachines();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedMachine) return;
    const sensorRef = ref(rtdb, `sensors/${selectedMachine.id}/sct013`);
    const unsub = onValue(sensorRef, (snap) => {
      const data = snap.val();
      if (!data) return;
      const list = Object.entries(data)
        .map(([k, v]) => ({ id: k, ...v }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-60);
      setReadings(list.map((r) => ({
        time: format(new Date(r.timestamp), 'HH:mm:ss'),
        value: parseFloat(r.current_a?.toFixed(2) || 0),
      })));
      const latest = list[list.length - 1];
      if (latest) {
        const status = analyzeCurrentReading(latest.current_a);
        setCurrentStatus(status);
        const predictive = predictiveMaintenance(list.map((r) => ({ value: r.current_a })));
        const allAlerts = [status.level !== 'normal' ? status : null, ...(predictive || [])]
          .filter(Boolean);
        setAlerts(allAlerts);
      }
    });
    return () => unsub();
  }, [selectedMachine]);

  async function loadMachines() {
    if (!user) return;
    const q = query(collection(db, 'machines'), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setMachines(list);
    if (list.length > 0 && !selectedMachine) setSelectedMachine(list[0]);
  }

  async function addMachine() {
    if (!newMachineName.trim()) return;
    const docRef = await addDoc(collection(db, 'machines'), {
      name: newMachineName.trim(),
      ownerId: user.uid,
      company: userData?.company || '',
      createdAt: new Date().toISOString(),
      sensors: [{ type: 'SCT-013', name: 'Corriente Resistencias Banda', unit: 'A' }],
    });
    const newM = { id: docRef.id, name: newMachineName.trim() };
    setMachines((prev) => [...prev, newM]);
    setSelectedMachine(newM);
    setNewMachineName('');
    setShowAddMachine(false);
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const latestReading = readings[readings.length - 1];

  return (
    <div style={{ minHeight: '100vh', background: '#070f1e', color: '#e8eef8' }}>
      <nav style={{
        background: '#0a1628',
        borderBottom: '1px solid #1d4e8f',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.3rem' }}>⚙️</span>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', color: '#fff' }}>Lumajira Maquinarias</div>
            <div style={{ fontSize: '0.75rem', color: '#5a8fc4' }}>{userData?.company || ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#5a8fc4' }}>👤 {userData?.name || user?.displayName}</span>
          <button onClick={handleLogout} style={{
            background: 'transparent',
            border: '1px solid #1d4e8f',
            borderRadius: '8px',
            color: '#5a8fc4',
            padding: '0.4rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {machines.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMachine(m)}
              style={{
                background: selectedMachine?.id === m.id ? '#1d4e8f' : '#0a1628',
                border: `1px solid ${selectedMachine?.id === m.id ? '#378add' : '#1d4e8f'}`,
                borderRadius: '10px',
                color: selectedMachine?.id === m.id ? '#fff' : '#5a8fc4',
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.9rem',
              }}
            >
              🏭 {m.name}
            </button>
          ))}
          <button
            onClick={() => setShowAddMachine(!showAddMachine)}
            style={{
              background: 'transparent',
              border: '1px dashed #1d4e8f',
              borderRadius: '10px',
              color: '#5a8fc4',
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            + Agregar máquina
          </button>
        </div>

        {showAddMachine && (
          <div style={{
            background: '#0a1628',
            border: '1px solid #1d4e8f',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}>
            <input
              value={newMachineName}
              onChange={(e) => setNewMachineName(e.target.value)}
              placeholder="Nombre de la máquina (ej. Inyectora JM-80)"
              onKeyDown={(e) => e.key === 'Enter' && addMachine()}
              style={{
                flex: 1,
                background: '#070f1e',
                border: '1px solid #1d4e8f',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
            <button onClick={addMachine} style={{
              background: '#1d4e8f',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
              fontWeight: '600',
            }}>
              Guardar
            </button>
          </div>
        )}

        {machines.length === 0 && (
          <div style={{
            background: '#0a1628',
            border: '1px solid #1d4e8f',
            borderRadius: '16px',
            padding: '3rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏭</div>
            <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>No hay máquinas registradas</h2>
            <p style={{ color: '#5a8fc4' }}>Agrega tu primera máquina de inyección para comenzar el monitoreo.</p>
          </div>
        )}

        {selectedMachine && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <MetricCard
                label="Corriente SCT-013"
                value={latestReading ? `${latestReading.value} A` : '— A'}
                sub="Resistencias de banda"
                status={currentStatus?.level}
              />
              <MetricCard
                label="Estado"
                value={currentStatus ? (currentStatus.level === 'normal' ? 'NORMAL' : currentStatus.level === 'warning' ? 'ADVERTENCIA' : 'CRÍTICO') : '—'}
                sub="Resistencias de banda"
                status={currentStatus?.level}
              />
              <MetricCard
                label="Lecturas"
                value={readings.length}
                sub="Últimos 60 puntos"
                status="normal"
              />
              <MetricCard
                label="Alertas activas"
                value={alerts.length}
                sub="Mantenimiento predictivo"
                status={alerts.length > 0 ? 'warning' : 'normal'}
              />
            </div>

            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{
                    background: a.level === 'critical' ? '#2a0a0a' : '#1a1500',
                    border: `1px solid ${a.level === 'critical' ? '#7a2020' : '#6b5500'}`,
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>{a.level === 'critical' ? '🚨' : '⚠️'}</span>
                    <div>
                      <div style={{ fontWeight: '600', color: a.level === 'critical' ? '#f09595' : '#fac775', marginBottom: '0.2rem' }}>
                        {a.message}
                      </div>
                      {a.maintenance && (
                        <div style={{ fontSize: '0.875rem', color: a.level === 'critical' ? '#e24b4a88' : '#ba751788' }}>
                          🔧 {a.maintenance}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              background: '#0a1628',
              border: '1px solid #1d4e8f',
              borderRadius: '16px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                  📈 Corriente en tiempo real — SCT-013
                </h2>
                <span style={{ fontSize: '0.8rem', color: '#5a8fc4' }}>Resistencias de banda · {selectedMachine.name}</span>
              </div>
              {readings.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={readings} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1d4e8f44" />
                    <XAxis dataKey="time" tick={{ fill: '#5a8fc4', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#5a8fc4', fontSize: 11 }} unit="A" domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#0a1628', border: '1px solid #1d4e8f', borderRadius: '8px', color: '#e8eef8' }}
                      formatter={(v) => [`${v} A`, 'Corriente']}
                    />
                    <ReferenceLine y={8} stroke="#ba7517" strokeDasharray="4 4" label={{ value: 'Advertencia 8A', fill: '#ba7517', fontSize: 11 }} />
                    <ReferenceLine y={10} stroke="#e24b4a" strokeDasharray="4 4" label={{ value: 'Crítico 10A', fill: '#e24b4a', fontSize: 11 }} />
                    <Line type="monotone" dataKey="value" stroke="#378add" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#378add' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a8fc4' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
                    <p>Esperando datos del ESP32...</p>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Asegúrate que el ESP32 esté conectado y enviando datos.</p>
                  </div>
                </div>
              )}
            </div>

            <div style={{
              background: '#0a1628',
              border: '1px solid #1d4e8f',
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <h2 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1rem', fontWeight: '600' }}>
                🔩 Sensores registrados
              </h2>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <SensorCard type="SCT-013" label="Corriente resistencias de banda" unit="A" active />
                <SensorCard type="+ Agregar" label="Más sensores próximamente" unit="" active={false} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, status }) {
  const colors = {
    normal: { bg: '#071a12', border: '#0f6e56', text: '#5dcaa5' },
    warning: { bg: '#1a1200', border: '#854f0b', text: '#ef9f27' },
    critical: { bg: '#1a0707', border: '#a32d2d', text: '#f09595' },
    default: { bg: '#0a1628', border: '#1d4e8f', text: '#378add' },
  };
  const c = colors[status] || colors.default;
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '12px',
      padding: '1.25rem',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#5a8fc4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: '700', color: c.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: '#5a8fc444', marginTop: '0.4rem' }}>{sub}</div>
    </div>
  );
}

function SensorCard({ type, label, unit, active }) {
  return (
    <div style={{
      background: active ? '#071228' : '#0a1628',
      border: `1px solid ${active ? '#378add' : '#1d4e8f44'}`,
      borderRadius: '10px',
      padding: '1rem 1.25rem',
      minWidth: '180px',
      opacity: active ? 1 : 0.5,
    }}>
      <div style={{ fontWeight: '700', color: active ? '#378add' : '#5a8fc4', fontSize: '0.95rem' }}>{type}</div>
      <div style={{ fontSize: '0.8rem', color: '#5a8fc4', marginTop: '0.25rem' }}>{label}</div>
      {unit && <div style={{ fontSize: '0.75rem', color: '#1d4e8f', marginTop: '0.25rem' }}>Unidad: {unit}</div>}
    </div>
  );
}