# Ruttplaneraren - Smart Ruttoptimering för Budbilar

Välkommen till **Ruttplaneraren**! Detta är en modern, supersnabb och mobilanpassad Progressive Web App (PWA) framtagen för distributionsförare och budbilschaufförer. Den hjälper dig att minimera körtider, packa bilen optimalt enligt LIFO-principen (Last In, First Out) och spåra dina leveranser med en realtids-ETA.

---

## 🚀 Snabbguide: Distribuera Gratis via GitHub Pages

Appen är helt fristående (statisk HTML/CSS/JS) och har inga servrar eller databaser. Det betyder att du kan köra den helt **gratis** direkt på din smartphone via GitHub Pages!

Följ dessa enkla steg för att lägga upp din egen version:

### Steg 1: Skapa ett GitHub-konto & ett nytt arkiv (Repository)
1. Gå till [github.com](https://github.com/) och logga in (eller skapa ett gratis konto).
2. Klicka på plustecknet (`+`) i övre högra hörnet och välj **New repository**.
3. Ge ditt arkiv ett namn, till exempel `ruttplaneraren`.
4. Välj att göra projektet **Public** (detta krävs för gratis GitHub Pages).
5. Lämna "Add a README file" avbockad och klicka på **Create repository**.

### Steg 2: Ladda upp kodfilerna
Du kan ladda upp filerna direkt via webbläsaren:
1. På din nya repository-sida, klicka på länken **"uploading an existing file"** (finns i den lilla texten under kommandoradsinstruktionerna).
2. Markera följande 7 filer i din projektmapp och dra-och-släpp dem i webbläsarfönstret:
   - `index.html`
   - `app.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
3. Vänta tills alla filer har laddats upp.
4. Skriv en kort kommentar i fältet längst ner (t.ex. "Initial upload") och klicka på **Commit changes**.

### Steg 3: Aktivera GitHub Pages
1. Gå till fliken ⚙️ **Settings** i menyraden högst upp i ditt repository.
2. Välj **Pages** i menyn på vänster sida.
3. Under rubriken **Build and deployment -> Branch**, ändra dropdown-menyn från `None` till **`main`** (eller `master`).
4. Lämna mappen som `/ (root)` och klicka på 💾 **Save**.
5. Vänta cirka 1–2 minuter. Längst upp på inställningssidan kommer en grön ruta att dyka upp med din unika webblänk, till exempel:
   `https://ditt-användarnamn.github.io/ruttplaneraren/`

---

## 📱 Installera på din smartphone (PWA)

När länken är aktiv kan du installera appen på din telefon så att den fungerar precis som en vanlig app utan webbläsarens gränssnitt:

### På iPhone (iOS - Safari):
1. Öppna din unika GitHub Pages-länk i **Safari**.
2. Klicka på **Dela-knappen** (fyrkanten med en pil uppåt) i webbläsarens bottenmeny.
3. Bläddra ner och klicka på ➕ **Lägg till på hemskärmen** (Add to Home Screen).
4. Bekräfta genom att klicka på **Lägg till**. Appen finns nu på din hemskärm med en snygg mörk ikon och startar i helskärmsläge utan adressfält!

### På Android (Chrome):
1. Öppna din unika länk i **Google Chrome**.
2. Chrome kommer automatiskt att visa en banner längst ner: *"Lägg till Ruttplaneraren på startskärmen"*. Klicka på den.
3. Om bannern inte syns, klicka på de tre prickarna i övre högra hörnet och välj **Installera app** eller **Lägg till på startskärmen**.

---

## 🚛 Användarmanual för Föraren

Appen är uppdelad i tre tydliga faser som du navigerar mellan via knapparna i botten:

### 1. Planera (Ruttplanering)
* **Start-/Slutlager:** Expandera fliken *"Konfigurering & Lager"* och skriv in din startpunkt för dagen (t.ex. *Lagergatan 5, Halmstad*). Klicka på **Spara**. Detta låser start- och slutdestinationen för optimeringen.
* **Inställningar:** Sätt din **Standardort** (t.ex. Halmstad). Om du bara skriver gatuadressen *"Storgatan 12"* i sökrutan kommer appen automatiskt lägga till orten så att du slipper skriva den varje gång. Ställ även in din **Stopptid** (hur många minuter varje paketleverans tar, t.ex. 3 eller 5 minuter).
* **Lägg till leveranser:** Skriv in dina adresser en efter en och klicka på **Lägg till**. Adressen kontrolleras direkt mot karttjänsten och läggs till i listan.
  * *Dubblettvarning:* Om du försöker lägga till en adress som redan finns i listan varnar appen direkt.
* **Optimera Rutt:** Klicka på den stora blå knappen **Optimera Rutt**. Appen sorterar nu blixtsnabbt alla mellanstopp så att du kör den absolut kortaste och snabbaste sträckan, med lagret som fast start och slut.
* **Manuell justering (Drag-and-Drop):** Vill du flytta ett stopp manuellt? Håll in och dra i ikonen med de sex prickarna till vänster om adressen för att flytta den uppåt eller nedåt i listan. Rutten och din ETA uppdateras direkt!

### 2. Lastlista (Packning enligt LIFO)
* Denna lista är **bakåtvänd (LIFO - Last In, First Out)** utifrån din optimerade rutt.
* Paketen högst upp i listan ska levereras först på din rutt. Därför måste de packas **sist (närmast bakdörrarna)**.
* Paketen i botten ska levereras sist och ska därför packas **längst in i skåpet (närmast förarhytten)**.
* Bocka av paketen i listan med kryssrutan vartefter du bär in dem i budbilen för full kontroll.

### 3. Körläge (Leverans & Navigering)
* **Kartan:** Visar din rutt och alla stopp. Det aktuella stoppet lyser grönt med en blinkande effekt, slutförda stopp är gråmarkerade och misslyckade är röda.
* **Aktivt stopp:** Visar adressen du ska köra till i jättestor, tydlig text.
* **Starta navigering:** Klicka på den stora gula knappen. Den öppnar omedelbart **Google Maps-appen** i din telefon med turn-by-turn navigering inställd på stoppets koordinater.
* **Leveransåtgärder:**
  * **Levererad (Grön):** Klicka här när paketet är överlämnat. Appen bockar av stoppet, flyttar framstegsmätaren och fokuserar direkt på nästa adress.
  * **Kunde ej leverera (Röd):** Om kunden inte är hemma eller porten är låst, klicka här. Appen markerar stoppet och flyttar det **automatiskt till det absoluta slutet av kön** (precis innan du åker tillbaka till lagret) så att du kan göra ett nytt försök i slutet av passet utan att avbryta din planerade körning.
* **ETA-motor:** Den mörka statusraden längst upp visar din beräknade sluttid tillbaka till lagret. Denna tid räknas om direkt när du gör en manuell ändring, kör vilse, blir försenad eller bockar av ett stopp!
