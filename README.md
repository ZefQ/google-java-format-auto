# Google Java Format (Auto)

Automatiskt formatterar Java-filer med hjälp av **google-java-format**.  
Formatteringen körs direkt via den officiella JAR-filen och kan enkelt uppdateras till valfri version.

---

## Funktioner

- Formaterar `.java`-filer automatiskt med **Google Java Format**
- Stöd för både **Google Style** och **AOSP Style**
- Automatisk nedladdning av rätt version av `google-java-format`
- Lagrar checksumma och metadata för nedladdad JAR för att upptäcka korruption och återanvända cache
- Möjlighet att byta version via inställning eller manuellt kommando

---

## Inställningar

Lägg till följande i din `settings.json` för att anpassa beteendet:

```json
{
  "googleJavaFormat.aospStyle": false,
  "googleJavaFormat.version": "1.30.0",
  "googleJavaFormat.downloadUrl": "https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar",
  "googleJavaFormat.checksum": ""
}
```

### Förklaringar

| Inställning                    | Typ       | Standard   | Beskrivning                                                                 |
| ------------------------------ | --------- | ---------- | --------------------------------------------------------------------------- |
| `googleJavaFormat.aospStyle`   | `boolean` | `false`    | Använd AOSP-stil istället för Google-stil                                   |
| `googleJavaFormat.version`     | `string`  | `"1.30.0"` | Vilken version av `google-java-format` som ska användas                     |
| `googleJavaFormat.downloadUrl` | `string`  | _(mall)_   | URL-mall för att ladda ner JAR-filen. `${version}` ersätts med vald version |
| `googleJavaFormat.checksum`    | `string`  | `""`       | Valfri SHA-256 checksumma som verifierar den nedladdade JAR-filen           |

---

## Kommandon

| Kommando                                | Beskrivning                                             |
| --------------------------------------- | ------------------------------------------------------- |
| **Google Java Format: Test Activation** | Verifierar att tillägget är aktivt                      |
| **Google Java Format: Update JAR**      | Laddar ner vald version av `google-java-format` på nytt |

---

## Utveckling

- `npm run clean` tar bort `out/` innan en ny kompilering.
- `npm run lint` kör ESLint för kodkvalitet på `src/**/*.ts` och `src/**/*.js` (Prettier hanterar formatering).
- `npm run format` kör Prettier och uppdaterar alla filer.
- `npm run fix` kör ESLint med `--fix` följt av Prettier för att synka stil.
- `npm run test:unit` kör snabba enhetstester med mockad VS Code-miljö.
- `npm run test:integration` kräver `xvfb-run` och startar den officiella VS Code-testharnessen.
