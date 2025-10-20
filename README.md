# Google Java Format (Auto)

Automatiskt formatterar Java-filer med hjälp av **google-java-format**.  
Formatteringen körs direkt via den officiella JAR-filen och kan enkelt uppdateras till valfri version.

---

## Funktioner

- Formaterar `.java`-filer automatiskt med **Google Java Format**
- Stöd för både **Google Style** och **AOSP Style**
- Automatisk nedladdning av rätt version av `google-java-format`
- Möjlighet att byta version via inställning eller manuellt kommando

---

## Inställningar

Lägg till följande i din `settings.json` för att anpassa beteendet:

```json
{
  "googleJavaFormat.aospStyle": false,
  "googleJavaFormat.version": "1.30.0",
  "googleJavaFormat.downloadUrl": "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar"
}
```

### Förklaringar

| Inställning                    | Typ       | Standard   | Beskrivning                                                                 |
| ------------------------------ | --------- | ---------- | --------------------------------------------------------------------------- |
| `googleJavaFormat.aospStyle`   | `boolean` | `false`    | Använd AOSP-stil istället för Google-stil                                   |
| `googleJavaFormat.version`     | `string`  | `"1.30.0"` | Vilken version av `google-java-format` som ska användas                     |
| `googleJavaFormat.downloadUrl` | `string`  | _(mall)_   | URL-mall för att ladda ner JAR-filen. `${version}` ersätts med vald version |

---

## Kommandon

| Kommando                                | Beskrivning                                             |
| --------------------------------------- | ------------------------------------------------------- |
| **Google Java Format: Test Activation** | Verifierar att tillägget är aktivt                      |
| **Google Java Format: Update JAR**      | Laddar ner vald version av `google-java-format` på nytt |
