# RuttMästaren – Distributionsguide för GitHub Pages

Denna guide hjälper dig att ladda upp källkoden för **RuttMästaren** till ditt eget GitHub-konto och publicera den som en gratis webbapplikation (PWA). Därefter kan du öppna länken direkt på din smartphone, installera appen på hemskärmen och använda den i din budbil!

---

## Steg 1: Skapa ett GitHub-konto och ett nytt arkiv (Repository)
Om du inte redan har ett GitHub-konto, skapa ett kostnadsfritt på [github.com](https://github.com).

1. Logga in på GitHub.
2. Klicka på plustecknet `+` i det övre högra hörnet och välj **New repository** (Nytt arkiv).
3. Ge arkivet ett namn, till exempel `rutt-planerare` eller `ruttmastaren`.
4. Välj att arkivet ska vara **Public** (Offentligt) – detta krävs för att kunna använda gratisversionen av GitHub Pages.
5. Lämna alternativen *Initialize this repository with* omarkerade (lägg inte till README, .gitignore eller licens här).
6. Klicka på den gröna knappen **Create repository** (Skapa arkiv).

---

## Steg 2: Ladda upp källkoden till GitHub
Du kan ladda upp filerna direkt via webbläsaren eller med Git på din dator.

### Alternativ A: Uppladdning direkt i webbläsaren (Enklast)
1. På sidan för ditt nyskapade arkiv, klicka på länken **"uploading an existing file"** som finns i instruktionstexten.
2. Dra och släpp följande filer från din dator till uppladdningsytan:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
   - Hela mappen `assets` med tillhörande ikoner (om tillgängliga).
3. Vänta tills alla filer har laddats upp.
4. Skriv ett kort meddelande i fältet *Commit changes* (t.ex. "Initial commit") och klicka på den gröna knappen **Commit changes**.

### Alternativ B: Uppladdning via terminalen (Git)
Kör följande kommandon i din projektmapp på din dator:
```bash
# Initiera lokalt git-arkiv
git init

# Lägg till alla projektfiler
git add .

# Skapa din första commit
git commit -m "Första uppladdningen av RuttMästaren"

# Byt namn på huvudgrenen till main
git branch -M main

# Koppla ditt lokala arkiv till GitHub (ersätt med din webbadress!)
git remote add origin https://github.com/DITT_ANVÄNDARNAMN/RUTT_REPOSITORY.git

# Skicka upp källkoden
git push -u origin main
```

---

## Steg 3: Aktivera GitHub Pages
Nu ska vi göra koden körbar som en hemsida!

1. Gå till fliken **Settings** (Inställningar) längst upp i ditt GitHub-arkiv.
2. I menyn till vänster, under sektionen *Code and automation*, klicka på **Pages**.
3. Under rubriken **Build and deployment**:
   - Kontrollera att *Source* är inställd på **Deploy from a branch**.
   - Under *Branch*, ändra från `None` till **`main`**.
   - Låt mappen vara inställd på **`/ (root)`**.
4. Klicka på knappen **Save** (Spara).
5. Vänta i 1–2 minuter. GitHub kommer nu att bygga och publicera din applikation i bakgrunden.
6. Uppdatera sidan. Längst upp under rubriken *GitHub Pages* kommer du nu att se en grön text med din personliga länk, till exempel:
   `Your site is live at https://DITT_ANVÄNDARNAMN.github.io/RUTT_REPOSITORY/`

---

## Steg 4: Installera RuttMästaren på din Smartphone (PWA)
Eftersom RuttMästaren är en fullfjädrad **Progressive Web App (PWA)** kan den installeras och köras i helskärmsläge på din mobil – precis som en vanlig app!

### För iPhone (iOS & Safari):
1. Öppna webbläsaren **Safari** på din iPhone.
2. Gå till din publicerade GitHub Pages-länk (t.ex. `https://användarnamn.github.io/ruttmastaren/`).
3. Klicka på **Dela-knappen** (ikonen med en fyrkant och en uppåtpekande pil) i bottenmenyn.
4. Rulla ner i menyn och tryck på **Lägg till på hemskärmen** (Add to Home Screen).
5. Klicka på **Lägg till** i det övre högra hörnet.
6. Ikonen för **RuttMästaren** dyker nu upp på din hemskärm! Klicka på den för att köra i helt ostört fullskärmsläge.

### För Android (Samsung, Pixel, Xiaomi, etc. & Chrome):
1. Öppna webbläsaren **Google Chrome** på din mobil.
2. Gå till din publicerade GitHub Pages-länk.
3. Chrome kommer automatiskt att visa en popup längst ner som frågar **"Lägg till RuttMästaren på hemskärmen"**. Tryck på den!
4. Om popupen inte visas, klicka på de **tre punkterna** i det övre högra hörnet och välj **Installera app** eller **Lägg till på startskärmen**.
5. Godkänn installationen. Appen installeras nu på din enhet och kan startas direkt från din app-låda eller hemskärm.

---

## 🛠️ Offline-läge och Cache-uppdateringar
- **Offline-stöd**: Tack vare appens Service Worker (`sw.js`) kan du starta och använda appen även om din budbil tappar internetuppkopplingen under skiftet. Kartan och adressinmatningen kräver nätverk för geokodning, men dina sparade rutter, lastlistor, checklistor och den statiska ETA-motorn fungerar till 100% offline!
- **Uppdateringsknapp**: Om du gör kodändringar på GitHub och vill hämta den senaste versionen till din mobil, klicka på knappen **UPPDATERA** i appens header. Det rensar mobilens lokala cache och laddar omedelbart in den absolut senaste versionen utan att du förlorar din sparade rutt!
