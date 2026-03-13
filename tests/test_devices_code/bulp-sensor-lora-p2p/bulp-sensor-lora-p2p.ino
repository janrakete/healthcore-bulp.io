#include <SoftwareSerial.h>
SoftwareSerial la66(10, 11); // RX, TX

String now() {
  return "[" + String(millis()) + " ms] ";
}

String toHex(String input) {
  String hex = "";
  for (char c : input) {
    char buf[3];
    sprintf(buf, "%02X", c);  // 't' → "74"
    hex += buf;
  }
  return hex;
}


void sendAT(String cmd) {
  Serial.println(now() + "SEND: " + cmd);
  la66.println(cmd);
  delay(300);
  while (la66.available()) {
    String resp = la66.readStringUntil('\n');
    resp.trim();
    if (resp.length() > 0) {
      Serial.println(now() + "RESPONSE: " + resp);
    }
  }
}

void setup() {
  Serial.begin(9600);
  la66.begin(9600);
  delay(2000);

  Serial.println(now() + "Init LA66 P2P TX");

  sendAT("AT+FRE=868.700,868.700");
  sendAT("AT+SF=12,12");
  sendAT("AT+BW=0,0");
  sendAT("AT+POWER=14");
  sendAT("AT+CRC=1,1");
  
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend > 10000) {
    lastSend = millis();
String payload = "A84041EFB1896CFA11";
String cmd = "AT+SEND=1," + payload + ",0,3";
sendAT(cmd);

  }
}