# EatAndFit

App Android per diario alimentare, peso e foto dei check. I dati restano sul telefono (backup manuale su Drive dall'app).

## Installazione
Scarica l'ultimo `EatAndFit-x.y.z.apk` da [Releases](https://github.com/Roby5991/EatAndFit/releases/latest) e aprilo sul telefono (la prima volta Android chiede di consentire l'installazione da questa fonte).
L'app controlla da sola se c'è una versione nuova e propone l'aggiornamento: i dati restano.

## Funzioni
- **Oggi**: calorie e macro del giorno, peso, ultimo check, promemoria del backup
- **Alimentazione**: pasti, ricerca tra i tuoi alimenti, codice a barre con la fotocamera (Open Food Facts), lettura dei valori dalla foto dell'etichetta (sul telefono), obiettivi per giorno della settimana, Nutri-Score / NOVA / additivi, fibre-zuccheri-sodio rispetto alle linee guida LARN
- **Peso e foto**: pesate, grafico, media 7 giorni, foto dei check e confronto tra due date
- **Backup**: ⋯ → Fai il backup → condividi su Drive; ⋯ → Ripristina da un backup
- **Alimenti di Roberto**: ogni giorno l'app scarica `db/alimenti.json` (pubblicato dal NAS di Roberto) e aggiunge gli alimenti nuovi; quelli inseriti o modificati sul telefono non vengono mai toccati. ⋯ → "Manda i miei alimenti a Roberto" crea il file da mandargli.

## Nuova versione (per chi mantiene l'app)
1. Modifica il codice in `www/` e scrivi le novità in `NOVITA.md`
2. Crea un tag `vX.Y.Z` (più alto del precedente) e caricalo: GitHub compila l'APK e lo pubblica in Releases
3. Segreti necessari (Settings → Secrets and variables → Actions): `KEYSTORE_B64` (la chiave di firma in base64) e `KEYSTORE_PASS`.
   **La chiave va conservata**: senza la stessa chiave gli aggiornamenti non si installano sopra la versione precedente.

Prova nel browser: `npm run serve` → http://localhost:8080
