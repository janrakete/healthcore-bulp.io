#include <SoftwareSerial.h>

SoftwareSerial lora(10, 11); // RX (vom LA66 TX), TX (zum LA66 RX)

void sendCommand(String cmd, unsigned long wait = 300) {
  Serial.print(">> ");
  Serial.println(cmd);
  lora.println(cmd);
  delay(wait);

  while (lora.available()) {
    String response = lora.readStringUntil('\n');
    Serial.println(response);
  }
}

void setup() {
  Serial.begin(9600);  // Serielle Schnittstelle zum Monitor
  lora.begin(9600);    // UART zum LA66
  delay(2000);

    sendCommand("AT+NJM=1");
  sendCommand("AT+RESET", 1000); // Hard-Reset

  delay(2000);

  Serial.println("Initialisiere LA66...");

  // Frequenzregion AS923 (Region bei TTN beachten)
  sendCommand("AT+DR=0");          // SF10 für AS923
  sendCommand("AT+CH=NUM,0-2");    // Aktiviere Kanal 0-2 für TTN
   sendCommand("AT+POWER=14"); 

  // LoRaWAN OTAA Konfiguration
  sendCommand("AT+ID=DevEui,\"A84041EFB1896CFA\"");
  sendCommand("AT+ID=AppEui,\"A840410000000101\"");
  sendCommand("AT+KEY=APPKEY,\"C37B8B8C4FBD5D5F084598121F614AF2\"");
  sendCommand("AT+MODE=LWOTAA");

  // Verbinde mit TTN
  sendCommand("AT+JOIN", 8000); // Etwas länger warten
  delay(30000); // Warte auf Join
}

void loop() {
  Serial.println("\n--- Neue Nachricht senden ---");
  sendCommand("AT+CH?");
  sendCommand("AT+STATUS?");
  sendCommand("AT+MSG=\"1\"", 5000);

  
  delay(300000); // 5 Minuten warten (Fair Use Policy beachten)
}