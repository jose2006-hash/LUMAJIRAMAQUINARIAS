#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "EmonLib.h"
#include <math.h>

// ============================================================
// CONFIGURACIÓN
// ============================================================
const char* WIFI_SSID = "Josepro";
const char* WIFI_PASSWORD = "12345678";
const char* FIREBASE_HOST = "lumajiramaquinarias-9f2d4-default-rtdb.firebaseio.com";
const char* FIREBASE_API_KEY = "process.env.REACT_APP_FIREBASE_API_KEY";
const char* MACHINE_ID = "t6WfDV4dLfcg91PkdmXwTblkbLl1";

// ============================================================
// PINES
// ============================================================
const int SCT_PIN = 34;
const int THERMISTOR_PIN = 36;
const int EMERGENCY_STOP_PIN = 27;

// Motor Inyección (Motor 1)
const int INJ_STEP_PIN = 12;
const int INJ_DIR_PIN = 13;

// Motor Rotación (Motor 2)
const int ROT_STEP_PIN = 14;
const int ROT_DIR_PIN = 15;

// Calentador (Relay/PWM)
const int HEATER_PIN = 26;

// ============================================================
// CONSTANTES
// ============================================================
const float CALIBRATION = 29.0;
const unsigned long SEND_INTERVAL = 2000;
const unsigned long COMMAND_CHECK_INTERVAL = 500;

// NTC 10K Thermistor constants
const float THERMISTOR_NOMINAL = 10000.0;
const float TEMP_NOMINAL = 25.0;
const float B_COEFFICIENT = 3950.0;
const float SERIES_RESISTOR = 10000.0;

// PID Constants
const float KP = 2.0;
const float KI = 0.5;
const float KD = 1.0;

// Safety Limits
const float MAX_TEMP = 260.0;
const float MIN_TEMP = 100.0;
const float MAX_CURRENT = 12.0;

// ============================================================
// VARIABLES
// ============================================================
FirebaseData fbdo;
FirebaseData fbdoStream;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;
EnergyMonitor emon1;

unsigned long lastSend = 0;
unsigned long lastCommandCheck = 0;
bool firebaseReady = false;

// Temperature
float currentTemp = 0.0;
float targetTemp = 0.0;
float pidOutput = 0.0;
float pidError = 0.0;
float pidIntegral = 0.0;
float pidLastError = 0.0;
unsigned long lastPidTime = 0;

// Machine State
enum MachineState { IDLE, HEATING, INJECTING, COOLING, ERROR };
MachineState machineState = IDLE;

// Motor State
bool injectionRunning = false;
bool rotationRunning = false;
int injectionSpeed = 50;
int rotationSpeed = 30;

// Safety
bool emergencyStopActive = false;

// ============================================================
// FUNCIONES DE TEMPERATURA
// ============================================================
float readThermistor() {
    int adcValue = analogRead(THERMISTOR_PIN);
    float resistance = SERIES_RESISTOR / (4095.0 / adcValue - 1.0);
    
    float steinhart;
    steinhart = resistance / THERMISTOR_NOMINAL;
    steinhart = log(steinhart);
    steinhart /= B_COEFFICIENT;
    steinhart += 1.0 / (TEMP_NOMINAL + 273.15);
    steinhart = 1.0 / steinhart;
    steinhart -= 273.15;
    
    return steinhart;
}

// ============================================================
// FUNCIONES PID
// ============================================================
float computePID(float current, float target) {
    unsigned long now = millis();
    float dt = (now - lastPidTime) / 1000.0;
    lastPidTime = now;
    
    pidError = target - current;
    pidIntegral += pidError * dt;
    
    // Anti-windup
    if (pidIntegral > 255) pidIntegral = 255;
    if (pidIntegral < 0) pidIntegral = 0;
    
    float derivative = (pidError - pidLastError) / dt;
    pidLastError = pidError;
    
    float output = KP * pidError + KI * pidIntegral + KD * derivative;
    
    // Clamp output
    if (output > 255) output = 255;
    if (output < 0) output = 0;
    
    return output;
}

void setHeaterPower(int power) {
    if (power > 0 && !emergencyStopActive) {
        analogWrite(HEATER_PIN, power);
    } else {
        analogWrite(HEATER_PIN, 0);
    }
}

// ============================================================
// FUNCIONES DE MOTOR
// ============================================================
void moveMotor(int stepPin, int dirPin, int steps, bool direction, int speed) {
    digitalWrite(dirPin, direction ? HIGH : LOW);
    int delayUs = 1000 / speed;
    
    for (int i = 0; i < steps; i++) {
        if (emergencyStopActive) break;
        digitalWrite(stepPin, HIGH);
        delayMicroseconds(delayUs);
        digitalWrite(stepPin, LOW);
        delayMicroseconds(delayUs);
    }
}

void startInjection(int speed) {
    if (emergencyStopActive || currentTemp < MIN_TEMP) return;
    injectionRunning = true;
    machineState = INJECTING;
    
    // Injection: 200 steps at specified speed
    moveMotor(INJ_STEP_PIN, INJ_DIR_PIN, 200, true, speed);
    injectionRunning = false;
    
    if (machineState != ERROR) {
        machineState = IDLE;
    }
}

void startRotation(int speed) {
    if (emergencyStopActive) return;
    rotationRunning = true;
    
    // Rotation: continuous for plasticizing
    moveMotor(ROT_STEP_PIN, ROT_DIR_PIN, 1000, true, speed);
    rotationRunning = false;
}

void emergencyStop() {
    emergencyStopActive = true;
    machineState = ERROR;
    setHeaterPower(0);
    injectionRunning = false;
    rotationRunning = false;
}

void resetEmergencyStop() {
    emergencyStopActive = false;
    machineState = IDLE;
    pidIntegral = 0;
    pidLastError = 0;
}

// ============================================================
// FUNCIONES FIREBASE
// ============================================================
void connectWiFi() {
    WiFi.disconnect(true);
    delay(1000);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("Conectando a %s\n", WIFI_SSID);
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 30000) {
        Serial.print(".");
        delay(500);
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\nWiFi conectado! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\nFallo WiFi");
    }
}

void sendSensorData() {
    String basePath = String("machines/") + MACHINE_ID;
    
    // Send current
    double irms = emon1.calcIrms(200);
    if (irms < 0.3) irms = 0.0;
    
    FirebaseJson currentJson;
    currentJson.set("current_a", irms);
    currentJson.set("timestamp/.sv", "timestamp");
    currentJson.set("sensor", "SCT-013");
    currentJson.set("unit", "A");
    Firebase.RTDB.pushJSON(&fbdo, (basePath + "/sensors/sct013").c_str(), &currentJson);
    
    // Send temperature
    currentTemp = readThermistor();
    FirebaseJson tempJson;
    tempJson.set("temperature_c", currentTemp);
    tempJson.set("timestamp/.sv", "timestamp");
    tempJson.set("sensor", "NTC-10K");
    tempJson.set("unit", "C");
    Firebase.RTDB.pushJSON(&fbdo, (basePath + "/sensors/thermistor").c_str(), &tempJson);
    
    // Send status
    FirebaseJson statusJson;
    statusJson.set("state", machineStateToString());
    statusJson.set("currentTemp", currentTemp);
    statusJson.set("targetTemp", targetTemp);
    statusJson.set("injectionSpeed", injectionSpeed);
    statusJson.set("rotationSpeed", rotationSpeed);
    statusJson.set("emergencyStop", emergencyStopActive);
    statusJson.set("injectionRunning", injectionRunning);
    statusJson.set("rotationRunning", rotationRunning);
    statusJson.set("timestamp/.sv", "timestamp");
    Firebase.RTDB.setJSON(&fbdo, (basePath + "/status").c_str(), &statusJson);
    
    Serial.printf("Enviado: %.2f A, %.1f°C, Estado: %s\n", irms, currentTemp, machineStateToString());
}

String machineStateToString() {
    switch (machineState) {
        case IDLE: return "idle";
        case HEATING: return "heating";
        case INJECTING: return "injecting";
        case COOLING: return "cooling";
        case ERROR: return "error";
        default: return "idle";
    }
}

void streamCallback(StreamData data) {
    if (data.dataType() == "json") {
        FirebaseJson *json = data.toStreamObject();
        FirebaseJsonData jsonData;
        
        json->get(jsonData, "type");
        String commandType = jsonData.stringValue;
        
        Serial.printf("Comando recibido: %s\n", commandType.c_str());
        
        if (commandType == "setTemp") {
            json->get(jsonData, "params/targetTemp");
            targetTemp = jsonData.floatValue;
            if (targetTemp > 0 && machineState == IDLE) {
                machineState = HEATING;
            }
        }
        else if (commandType == "inject") {
            json->get(jsonData, "params/speed");
            injectionSpeed = jsonData.intValue;
            if (injectionSpeed <= 0) injectionSpeed = 50;
            startInjection(injectionSpeed);
        }
        else if (commandType == "rotate") {
            json->get(jsonData, "params/speed");
            rotationSpeed = jsonData.intValue;
            if (rotationSpeed <= 0) rotationSpeed = 30;
            startRotation(rotationSpeed);
        }
        else if (commandType == "stop") {
            injectionRunning = false;
            rotationRunning = false;
            machineState = IDLE;
            setHeaterPower(0);
        }
        else if (commandType == "emergencyStop") {
            emergencyStop();
        }
        else if (commandType == "resetEmergency") {
            resetEmergencyStop();
        }
        else if (commandType == "emergencyReset") {
            resetEmergencyStop();
        }
    }
}

void streamTimeout(bool timeout) {
    if (timeout) {
        Serial.println("Stream timeout, reconnecting...");
        Firebase.RTDB.beginStream(&fbdoStream, (String("machines/") + MACHINE_ID + "/commands").c_str());
    }
}

void setupFirebaseStream() {
    String commandPath = String("machines/") + MACHINE_ID + "/commands";
    Firebase.RTDB.beginStream(&fbdoStream, commandPath.c_str());
    Firebase.RTDB.setStreamCallback(&fbdoStream, streamCallback, streamTimeout);
    Firebase.RTDB.setStreamTimeout(&fbdoStream, 1000 * 60 * 5);
}

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    // Current sensor
    emon1.current(SCT_PIN, CALIBRATION);
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    
    // Motor pins
    pinMode(INJ_STEP_PIN, OUTPUT);
    pinMode(INJ_DIR_PIN, OUTPUT);
    pinMode(ROT_STEP_PIN, OUTPUT);
    pinMode(ROT_DIR_PIN, OUTPUT);
    digitalWrite(INJ_STEP_PIN, LOW);
    digitalWrite(ROT_STEP_PIN, LOW);
    
    // Heater pin
    pinMode(HEATER_PIN, OUTPUT);
    analogWrite(HEATER_PIN, 0);
    
    // Emergency stop
    pinMode(EMERGENCY_STOP_PIN, INPUT_PULLUP);
    
    // WiFi
    connectWiFi();
    
    // Firebase
    fbConfig.host = FIREBASE_HOST;
    fbConfig.api_key = FIREBASE_API_KEY;
    fbAuth.user.email = "";
    fbAuth.user.password = "";
    Firebase.begin(&fbConfig, &fbAuth);
    Firebase.reconnectWiFi(true);
    
    unsigned long t = millis();
    while (!Firebase.ready() && millis() - t < 10000) { delay(200); }
    firebaseReady = Firebase.ready();
    Serial.println(firebaseReady ? "Firebase OK" : "Firebase FALLO");
    
    // Setup Firebase stream for commands
    if (firebaseReady) {
        setupFirebaseStream();
    }
    
    lastPidTime = millis();
}

// ============================================================
// LOOP
// ============================================================
void loop() {
    // Check emergency stop button
    if (digitalRead(EMERGENCY_STOP_PIN) == LOW) {
        emergencyStop();
        Serial.println("EMERGENCY STOP ACTIVATED!");
    }
    
    // Send sensor data periodically
    if (millis() - lastSend >= SEND_INTERVAL) {
        lastSend = millis();
        
        if (firebaseReady && WiFi.status() == WL_CONNECTED) {
            sendSensorData();
        } else {
            connectWiFi();
            firebaseReady = Firebase.ready();
            if (firebaseReady) {
                setupFirebaseStream();
            }
        }
    }
    
    // PID Temperature Control
    if (machineState == HEATING || machineState == INJECTING) {
        currentTemp = readThermistor();
        
        if (currentTemp >= MAX_TEMP) {
            emergencyStop();
            Serial.println("MAX TEMPERATURE EXCEEDED!");
        } else {
            pidOutput = computePID(currentTemp, targetTemp);
            setHeaterPower((int)pidOutput);
            
            if (currentTemp >= targetTemp - 2.0 && machineState == HEATING) {
                Serial.println("Target temperature reached!");
            }
        }
    }
    
    // Check current safety
    double irms = emon1.calcIrms(200);
    if (irms > MAX_CURRENT && !emergencyStopActive) {
        emergencyStop();
        Serial.printf("MAX CURRENT EXCEEDED: %.2f A\n", irms);
    }
    
    Firebase.RTDB.readTimeout(&fbdoStream);
}
