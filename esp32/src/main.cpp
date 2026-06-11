#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "EmonLib.h"

const char* WIFI_SSID = "Josepro";
const char* WIFI_PASSWORD = "12345678";
const char* FIREBASE_HOST = "lumajiramaquinarias-9f2d4-default-rtdb.firebaseio.com";
const char* FIREBASE_API_KEY ="AIzaSyAcy7oZip5edaB1gnX6WrB4_d65BbXpvi4"
const char* MACHINE_ID = "t6WfDV4dLfcg91PkdmXwTblkbLl1";
const int SCT_PIN = 34;
const float CALIBRATION = 29.0;
const unsigned long SEND_INTERVAL = 5000;

FirebaseData fbdo;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;
EnergyMonitor emon1;
unsigned long lastSend = 0;
bool firebaseReady = false;

void connectWiFi();
void sendToFirebase(double current_a);

void setup() {
  Serial.begin(115200);
  delay(1000);
  emon1.current(SCT_PIN, CALIBRATION);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  connectWiFi();
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
}

void loop() {
  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();
    double irms = emon1.calcIrms(200);
    if (irms < 0.3) irms = 0.0;
    Serial.printf("Corriente RMS: %.2f A\n", irms);
    if (firebaseReady && WiFi.status() == WL_CONNECTED) {
      sendToFirebase(irms);
    } else {
      connectWiFi();
      firebaseReady = Firebase.ready();
    }
  }
}

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

void sendToFirebase(double current_a) {
  String path = String("sensors/") + MACHINE_ID + "/sct013";
  FirebaseJson json;
  json.set("current_a", current_a);
  json.set("timestamp/.sv", "timestamp");
  json.set("sensor", "SCT-013");
  json.set("unit", "A");
  if (Firebase.RTDB.pushJSON(&fbdo, path.c_str(), &json)) {
    Serial.printf("Enviado: %.2f A\n", current_a);
  } else {
    Serial.printf("Error: %s\n", fbdo.errorReason().c_str());
  }
}