## Plan: Tägliche Pflegeberichte pro Person

Ziel ist ein täglicher, pro Person erzeugter Bericht auf Basis der bereits vorhandenen Zeitreihen und Zuordnungen. Die Fachlogik soll zuerst deterministisch Fakten aus den Sensordaten ableiten; `node-llama-cpp` soll anschließend diese Fakten in einen verständlichen Pflegebericht formulieren. Damit bleibt die Ausgabe nachvollziehbar, prüfbar und robust gegen Halluzinationen.

**Steps**
1. Die aktuelle Datenflusskette stabilisieren und als Grundlage dokumentieren: Sensordaten kommen über die Bridges, landen in `mqtt_devices_values`, und Geräte sind bereits über `individualID` und `roomID` verknüpft. Diese vorhandene Struktur wird für die Berichtserstellung wiederverwendet, statt neue Zuordnungslogik zu erfinden.
2. Eine Berichtsfacts-Schicht definieren, die aus Rohdaten pro Person und Tag strukturierte Fakten erzeugt. Dazu gehören mindestens: Aktivitätsfenster, auffällige Zeitpunkte, Raumwechsel, nächtliche Bewegungen, wiederkehrende Muster und auffällige Ausreißer. Diese Schicht soll reine Datenlogik sein und ohne LLM testbar bleiben.
3. Den bestehenden `UnderstandingEngine` von einem Platzhalter-Wrapper zu einer echten Prompt-Engine umbauen. Er soll ein Modell initialisieren, strukturierte Fakten als Input annehmen und einen Berichtstext oder ein JSON-Resultat erzeugen. Der aktuelle `analyze()`-Weg wird durch eine klar benannte Berichtsmethode ersetzt oder ergänzt.
4. Einen täglichen Scheduler für Berichtserstellung ergänzen, angelehnt an den vorhandenen Minuten-Cron in `server/app.js`. Der Job aggregiert je Person den Vortag, ruft die Fakten-Schicht auf, lässt den Bericht durch das LLM formulieren und speichert das Ergebnis persistent ab.
5. Eine Persistenz für Berichte ergänzen, damit Berichte später abrufbar, nachvollziehbar und erneut anzeigbar sind. Dafür sollte eine eigene Tabelle verwendet werden, inklusive Datum, Person, Faktenbasis, Berichtstext und Modellmetadaten.
6. Einen API-Zugriff ergänzen, damit Pflegekräfte Berichte abrufen können. Der Fokus liegt zunächst auf Lesen und Tagesreport-Abfrage; Erstellen und Ändern bleibt intern beim Scheduler.
7. Tests für die Faktenlogik, die Zuordnungslogik und den Berichtspfad ergänzen. Der LLM-Teil sollte in Tests gemockt werden, damit die Erzeugung deterministisch überprüfbar bleibt.
8. Manuelle Verifikation mit realen oder Testdaten durchführen, um einen plausiblen Bericht pro Person zu prüfen und sicherzustellen, dass ungewöhnliche Zeiten und Raumereignisse korrekt erkannt werden.

**Concrete first implementation order**
1. Berichtsfacts-Schicht zuerst bauen, weil sie die fachliche Wahrheit enthält und sich ohne LLM testen lässt.
2. Danach `UnderstandingEngine` auf Prompt-basierte Textgenerierung umbauen, damit die Fakten in Berichtssprache übersetzt werden können.
3. Anschließend den täglichen Cron-Job einhängen, der pro Person den Vortag verarbeitet und den Engine-Aufruf startet.
4. Dann die Persistenz für Berichte ergänzen, damit erzeugte Berichte abrufbar und historisierbar sind.
5. Zum Schluss die API und UI-nahe Abfrage ergänzen, damit Pflegekräfte die Berichte lesen können.

**Immediate task breakdown**
1. Prüfen, welche vorhandenen Device- und History-Queries bereits genug Daten für Tagesfakten liefern, und diese Queries als Basis festlegen.
2. Eine kleine interne Reporting-Hilfsfunktion definieren, die pro Person und Datum die relevanten `mqtt_devices_values`-Einträge lädt und ordnet.
3. Die erste Faktenausgabe auf ein minimales Set begrenzen: erste/letzte Aktivität, Nachtaktivität, ungewöhnliche Zeitpunkte, Raumwechsel, relevante Sensorereignisse.
4. Den `UnderstandingEngine` auf eine Methode für strukturierte Eingaben und promptbasierte Ausgaben umstellen.
5. Einen Cron-Job für 1x täglich ergänzen und zunächst nur einen Bericht erzeugen und loggen, bevor Persistenz und API dazukommen.
6. Danach Speicherung und Abruf ergänzen, wenn der Berichttext inhaltlich stabil ist.

**Relevant files**
- `server/libs/UnderstandingEngine.js` — LLM-Wrapper und Berichtsgenerierung
- `server/app.js` — Einhängen des täglichen Cron-Jobs
- `server/libs/ScenarioEngine.js` — Referenz für vorhandene Zeit-/Kontextlogik
- `server/libs/AlertsEngine.js` — Referenz für Zeitreihen-Auswertung und Historienabfragen
- `server/routes/devices.js` — Referenz für Personen- und Raum-Enrichment
- `server/routes/data.js` — mögliche API-Erweiterung für Berichtsdaten
- `tests/setup.js` — Schema-Grundlage für neue Tabellen und Testdaten
- `tests/*.test.js` — neue Tests für Berichtserzeugung und Aggregation
- `config.js` — Modellpfad und optionale Berichtskonfiguration

**Verification**
1. Eine fokussierte Testreihe für die neue Faktenlogik schreiben und ausführen, inklusive Zuordnung `device -> person` und `device -> room -> person`.
2. Den LLM-Wrapper mit einem Mock testen, um sicherzustellen, dass strukturierte Fakten in einen Bericht überführt werden und Fehlerfälle sauber behandelt werden.
3. Einen Lauf mit Testdaten durchführen und prüfen, dass pro Person genau ein Tagesbericht entsteht und die gespeicherten Fakten nachvollziehbar bleiben.
4. Falls eine API ergänzt wird, die neue Route mit einem Integrationstest absichern.
5. Danach die bestehenden Jest-Tests laufen lassen, um sicherzustellen, dass die Änderungen den bisherigen Daten- und Szenarienfluss nicht stören.

**Decisions**
- Die Personenzuordnung bleibt deterministisch und basiert auf vorhandenen DB-Beziehungen, nicht auf freier LLM-Schätzung.
- Das LLM formuliert den Bericht, entscheidet aber nicht über die Zuordnung der Daten zu Personen.
- Die Berichte beziehen sich zunächst auf den Vortag und werden täglich erzeugt; Echtzeitberichte sind ausdrücklich nicht Teil dieses Plans.
- Raumgeräte werden über die Raum-zu-Person-Zuordnung ausgewertet; falls ein Raum mehrere Personen umfasst, muss dafür später eine zusätzliche fachliche Regel ergänzt werden.

**Further Considerations**
1. Soll der Tagesbericht nur als freier Text vorliegen, oder zusätzlich als strukturiertes JSON mit Abschnitten wie Schlaf, Mobilität und Auffälligkeiten? Empfehlung: beides speichern, damit UI und Export später flexibel bleiben.
2. Soll die Modellkonfiguration getrennt von der bestehenden `CONF_understandingEngineModel` erweitert werden, etwa um Prompt-Template, Temperatur oder maximale Ausgabelänge? Empfehlung: zunächst minimal halten und nur ergänzen, wenn die erste Version stabil läuft.
3. Sollen Berichte historisiert und versioniert werden, falls ein Bericht später neu berechnet wird? Empfehlung: ja, mindestens mit `createdAt` und `modelName`, damit Nachvollziehbarkeit erhalten bleibt.