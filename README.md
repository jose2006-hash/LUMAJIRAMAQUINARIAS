# Lumajira Maquinarias — Sistema de Monitoreo y Control Industrial

Sistema para monitorear y controlar máquinas de inyección en tiempo real usando ESP32 + Firebase + React.

## 📁 Estructura del proyecto

```
lumajira/
├── src/                    ← App React (web)
│   ├── firebase/config.js  ← Configuración Firebase
│   ├── hooks/useAuth.js    ← Auth con Firebase
│   ├── components/
│   │   └── ControlPanel.jsx ← Panel de control (temperatura, motores, emergencia)
│   ├── pages/
│   │   ├── SplashPage.jsx  ← Pantalla inicial con foto del equipo
│   │   ├── AuthPage.jsx    ← Login y registro
│   │   └── Dashboard.jsx   ← Monitoreo en tiempo real + control
│   └── utils/alerts.js     ← Lógica de alertas y mantenimiento predictivo
├── esp32/
│   ├── platformio.ini      ← Configuración PlatformIO
│   └── src/main.cpp        ← Firmware ESP32 (sensado + control + Firebase)
├── .env.example            ← Variables de entorno (copiar a .env)
├── firebase-rtdb-rules.json← Reglas Firebase Realtime DB
├── firestore.rules         ← Reglas Firestore
└── vercel.json             ← Configuración Vercel
```

---

## 🔧 1. Configurar Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → Crear proyecto
2. Activa **Authentication** → Email/Password
3. Crea **Firestore Database** (modo producción)
4. Crea **Realtime Database** (modo prueba por ahora)
5. En Project Settings → Web → Registra una app → copia las credenciales

### Aplicar reglas de seguridad:

**Firestore:** copia el contenido de `firestore.rules`  
**Realtime DB:** copia el contenido de `firebase-rtdb-rules.json`

---

## 🌐 2. Configurar la app React

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo .env (copia desde .env.example y llena los valores)
cp .env.example .env

# 3. Agrega la foto del equipo:
# Guarda la imagen como: src/assets/team.png

# 4. Desarrollo local
npm start

# 5. Build para producción
npm run build
```

---

## 📡 3. Configurar ESP32 (PlatformIO)

### Hardware necesario:
| Componente | Detalle |
|---|---|
| ESP32 DevKit | Cualquier versión |
| SCT-013-030 | Sensor de corriente 30A |
| NTC 10K | Termistor para temperatura |
| TB6600 | Driver para motores paso a paso |
| NEMA 23 x2 | Motores para inyección y rotación |
| Resistor burden | 33Ω (para SCT-013-030) |
| Capacitor | 10µF electrolítico |
| Relay/PWM | Para control de calentador |

### Conexión SCT-013:
```
SCT-013 (jack 3.5mm):
  Tip (señal) → PIN 34 del ESP32
  Sleeve (GND) → GND del ESP32

Circuito de acondicionamiento:
  PIN 34 ──┬── Resistor 33Ω ── GND
           │
           └── Capacitor 10µF (+) ── 3.3V
                                (−) ── GND
```

### Conexión NTC 10K:
```
NTC 10K Thermistor:
  Un pin → PIN 36 (ADC) del ESP32
  Otro pin → GND del ESP32
  Resistor 10K entre PIN 36 y 3.3V (divisor de voltaje)
```

### Conexión TB6600 (Motores):
```
TB6600 Driver 1 (Inyección):
  STEP → PIN 12 del ESP32
  DIR → PIN 13 del ESP32
  GND → GND del ESP32
  VCC → Fuente de poder motor

TB6600 Driver 2 (Rotación):
  STEP → PIN 14 del ESP32
  DIR → PIN 15 del ESP32
  GND → GND del ESP32
  VCC → Fuente de poder motor
```

### Conexión Calentador:
```
Relay/PWM Module:
  Signal → PIN 26 del ESP32
  VCC → 5V del ESP32
  GND → GND del ESP32
  COM → Fuente de poder resistencias
  NO → Resistencias de banda
```

### Paro de Emergencia:
```
Botón de Emergencia:
  Un pin → PIN 27 del ESP32 (INPUT_PULLUP)
  Otro pin → GND del ESP32
```

### Configurar firmware:
Edita `esp32/src/main.cpp` y cambia:
```cpp
const char* FIREBASE_HOST = "TU-PROYECTO-default-rtdb.firebaseio.com";
const char* FIREBASE_API_KEY = "tu_api_key";
const char* MACHINE_ID = "id_de_tu_maquina_en_firestore";
```

```bash
# Compilar y subir
cd esp32
pio run --target upload
pio device monitor  # Ver logs
```

---

## 🚀 4. Desplegar en Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Agregar variables de entorno en Vercel Dashboard:
# Settings → Environment Variables → pega todos los REACT_APP_*
```

---

## 📊 APIs recomendadas

| API | Uso | URL |
|---|---|---|
| **Firebase Realtime DB** | Datos en tiempo real del ESP32 | firebase.google.com |
| **Firebase Firestore** | Usuarios, máquinas, config | firebase.google.com |
| **Firebase Auth** | Login/registro | firebase.google.com |
| **Twilio** | Alertas por SMS/WhatsApp | twilio.com |
| **SendGrid** | Alertas por email | sendgrid.com |
| **PushOver / Firebase Cloud Messaging** | Notificaciones push móvil | firebase.google.com/fcm |
| **InfluxDB Cloud** | Series temporales avanzadas (futuro) | influxdata.com |

---

## ⚠️ Umbrales de alerta — SCT-013 Resistencias de Banda

| Nivel | Corriente | Acción |
|---|---|---|
| Normal | 0.5 – 8.0 A | Sin acción |
| Advertencia | 8.0 – 10.0 A | Revisar en 2h |
| Crítico | > 10.0 A | Detener máquina |
| Sin señal | < 0.3 A | Verificar conexiones |

## 🌡️ Umbrales de alerta — Temperatura NTC-10K

| Nivel | Temperatura | Acción |
|---|---|---|
| Crítico bajo | < 80°C | Verificar calentador |
| Advertencia bajo | < 100°C | Esperar calentamiento |
| Normal | 100 – 240°C | Sin acción |
| Advertencia alto | > 240°C | Monitorear de cerca |
| Crítico alto | > 260°C | Detener máquina |

## 🎮 Funciones de Control (desde teléfono)

| Función | Descripción |
|---|---|
| **Control de Temperatura** | Establecer temperatura objetivo (100-260°C) |
| **Control de Inyección** | Ajustar velocidad y activar inyección |
| **Control de Rotación** | Ajustar velocidad y activar rotación |
| **Paro de Emergencia** | Detener toda operación inmediatamente |
| **Parada Normal** | Detener calentamiento y motores |
| **Estado en Tiempo Real** | Ver estado de la máquina actualizado |

## 🔄 Secuencia de Inyección

1. Establecer temperatura objetivo (ej: 220°C para PP)
2. ESP32 calienta el barril usando PID
3. Cuando se alcanza la temperatura → Presionar "Inyectar"
4. Motor 1 rota (inyección) → Empuja plástico al molde
5. Motor 2 rota (husillo) → Plastifica siguiente shots
6. Temporizador de enfriamiento
7. Molde se abre (si aplica)
8. Pieza se expulsa

---

## 🔮 Roadmap futuro

- [x] Sensor de temperatura (NTC 10K) en barril
- [x] Control de temperatura PID
- [x] Control de motores (inyección + rotación)
- [x] Paro de emergencia
- [x] Control desde teléfono
- [ ] Sensor de presión hidráulica (4-20mA)
- [ ] Contador de ciclos (encoder o reed switch)
- [ ] Notificaciones WhatsApp vía Twilio
- [ ] Reporte PDF mensual automático
- [ ] Dashboard multi-máquina
