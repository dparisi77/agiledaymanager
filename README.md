# 📅 Agile Day Manager

Una **applicazione web moderna** per la pianificazione e gestione delle risorse nei team agile, con sincronizzazione real-time basata su **Firebase Firestore**.

## 🎯 Caratteristiche Principali

- **Autenticazione multi-ruolo** – Admin e User con permessi differenziati
- **Sincronizzazione Real-time** – Aggiornamenti istantanei tramite Firestore
- **Dashboard intuitiva** – Visualizzazione della pianificazione settimanale
- **Gestione risorse** – Creazione, modifica e eliminazione di risorse
- **Gestione utenti** – Panel dedicato per amministratori
- **Interfaccia scura moderna** – Tema dark-first con Bootstrap 5
- **Responsive design** – Funziona su desktop e dispositivi mobili

## 📋 Struttura del Progetto

```
agile_manager/
├── index.html                  # Entry point HTML
├── css/
│   └── style.css              # Styling personalizzato
├── js/
│   ├── app.js                 # Logica applicativa principale
│   ├── auth.js                # Gestione autenticazione
│   ├── dashboard.js           # Rendering della dashboard
│   ├── firebase.js            # Integrazione Firestore
│   └── utils.js               # Funzioni di utilità
└── README.md                  # Questo file
```

## 🚀 Come Iniziare

### Prerequisiti

- Un browser moderno (Chrome, Firefox, Edge, Safari)
- Un progetto Firebase attivo con Firestore Database

### Installazione e Setup

1. **Clona il repository**

   ```bash
   git clone <repository-url>
   cd agile_manager
   ```

2. **Configura Firebase**
   - Accedi a [Firebase Console](https://console.firebase.google.com)
   - Crea un nuovo progetto o usa uno esistente
   - Abilita **Firestore Database** in modalità test
   - Assicurati che le regole di Firestore permettano lettura e scrittura:
     ```
     allow read, write: if true;
     ```

3. **Avvia l'applicazione**
   - Apri `index.html` nel browser oppure
   - Usa un server locale:
     ```bash
     python -m http.server 8000
     # Oppure con Node.js:
     npx http-server
     ```
   - Accedi a `http://localhost:8000`

4. **Connetti Firebase**
   - Al primo accesso, visualizzerai il modal di setup
   - Copia i dati di configurazione dalla Firebase Console
   - Compila i campi: API Key, Auth Domain, Project ID, Storage Bucket, Messaging Sender ID, App ID
   - Clicca "Connetti a Firebase"
   - La configurazione verrà salvata nel localStorage per accessi futuri

## 🔐 Autenticazione

L'applicazione utilizza un sistema di autenticazione semplice:

- **Login** – Inserisci username e password
- **Sessione** – I dati di sessione vengono salvati in sessionStorage
- **Ruoli** – Admin e User con permessi differenziati
- **Logout** – Disponibile dal menu principale

## 📊 Funzionalità Principali

### Dashboard

- Visualizzazione della pianificazione settimanale
- Navigazione tra le settimane (indietro/avanti)
- Visualizzazione dello stato di sincronizzazione

### Gestione Risorse

- **Creazione** – Aggiungi nuove risorse
- **Modifica** – Aggiorna informazioni esistenti
- **Eliminazione** – Rimuovi risorse (solo admin)
- **Sincronizzazione** – Real-time con Firestore

### Panel Utenti (Admin Only)

- Visualizzazione elenco utenti
- Gestione dei ruoli e permessi

## 🔧 Stack Tecnologico

| Tecnologia               | Utilizzo                         |
| ------------------------ | -------------------------------- |
| **HTML5**                | Struttura pagina                 |
| **CSS3**                 | Styling personalizzato           |
| **JavaScript (Vanilla)** | Logica applicativa               |
| **Bootstrap 5**          | Framework UI                     |
| **Firebase SDK**         | Autenticazione e DB              |
| **Firestore**            | Database real-time               |
| **Google Fonts**         | Tipografie (Syne, IBM Plex Mono) |

## 📁 Descrizione File Principali

### `app.js`

Nucleo dell'applicazione. Gestisce:

- State management
- Routing tra view (login, main, dashboard, users)
- Azioni utente (login, logout)
- Comunicazione tra moduli

### `auth.js`

Sistema di autenticazione:

- Login/logout
- Gestione sessione
- Controllo ruoli

### `firebase.js`

Integrazione con Firebase:

- Inizializzazione Firestore
- CRUD operazioni
- Real-time listener
- Salvataggio configurazione

### `dashboard.js`

Rendering della planificazione:

- Visualizzazione settimanale
- Aggiornamento dinamico dei dati

### `utils.js`

Funzioni di utilità:

- Helper DOM
- Formattazione date
- Toast mensioni
- Funzioni comuni

## 🎨 Temi e Styling

L'applicazione utilizza un tema **dark-first** con:

- Colore primario: **Firebase Orange** (#FF5722)
- Sfondo scuro per ridurre l'affaticamento visivo
- Animazioni fluide ed effetti visivi
- Responsive breakpoints per mobile

## 🔄 Data Flow

```
User Interaction
       ↓
   app.js (State)
       ↓
firebase.js ←→ Firestore
       ↓
dashboard.js / UI Update
       ↓
Browser Render
```

## 🛠️ Sviluppo

### Aggiungere una New Feature

1. Identifica quale modulo è interessato (app, auth, firebase, etc.)
2. Aggiungi la funzione al modulo appropriato
3. Esponi la funzione nell'oggetto di ritorno del modulo IIFE
4. Chiama la funzione dall'app principale
5. Testa l'integrazione con Firestore

### Debug

- Apri **Developer Tools** (F12)
- Visualizza console per eventuali errori
- Usa il tab **Application** per ispezionare localStorage e sessionStorage
- Monitora **Firestore** dalla Firebase Console

## 📝 Note Importanti

- La configurazione Firebase è salvata in **localStorage** per persistenza
- I dati di sessione utente sono in **sessionStorage** (cancellati al chiudersi del browser)
- Firestore usa **real-time listeners** per sincronizzazione istantanea
- L'applicazione è **client-only** (nessun backend server richiesto)

## 🚨 Troubleshooting

**Problema:** Firebase non è connesso

- **Soluzione:** Verifica che la configurazione Firebase sia corretta e le regole di Firestore permettano l'accesso

**Problema:** Login fallito

- **Soluzione:** Controlla username e password. Assicurati che l'utente sia registrato nella base dati

**Problema:** Dati non si sincronizzano

- **Soluzione:** Controlla la connessione internet e le regole di Firestore

## 📄 Licenza

Questo progetto è mantenuto da Davide Parisi.

## 📧 Supporto

Per domande, bug report o suggerimenti, apri un issue nel repository.

---

**Versione:** 1.0  
**Ultimo aggiornamento:** Marzo 2026
