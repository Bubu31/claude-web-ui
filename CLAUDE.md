# CLAUDE.md - Claude Code Multi-Instance Web UI

## Objectif du projet

Créer une interface web locale permettant de gérer et visualiser plusieurs instances de Claude Code en parallèle, chacune travaillant sur un dossier différent.

## Contraintes

- Usage local uniquement (localhost)
- Maximum 4-5 instances simultanées
- Fonctionnalité principale : visualisation des terminaux
- Stack : Node.js (choix pour compatibilité optimale node-pty/xterm.js)

## Architecture

```
claude-code-ui/
├── package.json
├── server.js              # Serveur principal Express + WebSocket
├── src/
│   ├── pty-manager.js     # Gestion des processus PTY
│   └── config.js          # Configuration (ports, limites, etc.)
└── public/
    ├── index.html         # Page principale
    ├── css/
    │   └── style.css      # Styles (layout grille, terminaux)
    └── js/
        ├── app.js         # Logique principale frontend
        ├── terminal.js    # Wrapper xterm.js
        └── websocket.js   # Gestion connexions WebSocket
```

## Dépendances

### Backend (package.json)

```json
{
  "name": "claude-code-ui",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "node-pty": "^1.0.0"
  }
}
```

### Frontend (CDN)

- xterm.js (terminal emulator)
- xterm-addon-fit (auto-resize)
- xterm-addon-webgl (performance)

## Spécifications fonctionnelles

### 1. Gestion des instances

#### Créer une instance
- L'utilisateur clique sur "Nouvelle instance" ou sur un panel vide
- Une boîte de dialogue permet de sélectionner/saisir le chemin du dossier de travail
- Le serveur :
  1. Vérifie que le dossier existe
  2. Vérifie qu'on n'a pas atteint la limite (5 instances)
  3. Spawn un processus `claude` via node-pty dans le dossier spécifié
  4. Associe un ID unique à l'instance
  5. Retourne l'ID au client

#### Fermer une instance
- Bouton de fermeture sur chaque panel
- Le serveur envoie SIGTERM au processus PTY
- Timeout de 5 secondes puis SIGKILL si nécessaire
- Nettoyage des ressources (WebSocket, PTY)

#### Lister les instances
- Au chargement de la page, récupérer la liste des instances actives
- Permet de reconnecter aux instances existantes après refresh

### 2. Communication Terminal

#### WebSocket Protocol

Chaque instance a sa propre connexion WebSocket.

**URL de connexion** : `ws://localhost:3000/terminal/:instanceId`

**Messages Client → Serveur** :
```javascript
// Input clavier
{ type: "input", data: "ls -la\r" }

// Redimensionnement terminal
{ type: "resize", cols: 80, rows: 24 }
```

**Messages Serveur → Client** :
```javascript
// Output terminal
{ type: "output", data: "..." }

// Instance fermée
{ type: "exit", code: 0 }

// Erreur
{ type: "error", message: "..." }
```

### 3. Interface utilisateur

#### Layout
- Grille responsive 2x2 (extensible à 2x3 pour 5-6 instances)
- Chaque cellule contient :
  - Header : nom du dossier (tronqué) + bouton fermer
  - Body : terminal xterm.js
  - Indicateur de statut (actif/fermé)

#### Interactions
- Clic sur un terminal = focus (reçoit les inputs clavier)
- Le terminal actif a une bordure colorée distinctive
- Double-clic sur header = copier le chemin complet

#### Responsive
- Sur écran large : grille 2x2 ou 2x3
- Sur écran moyen : grille 1x2
- Sur petit écran : tabs/carousel

### 4. API REST

#### Endpoints

```
GET  /api/instances
     → Liste des instances actives
     → Response: { instances: [{ id, cwd, status, createdAt }] }

POST /api/instances
     → Créer une nouvelle instance
     → Body: { cwd: "/path/to/directory" }
     → Response: { id, cwd, status }

DELETE /api/instances/:id
     → Fermer une instance
     → Response: { success: true }

GET /api/instances/:id
     → Détails d'une instance
     → Response: { id, cwd, status, createdAt }
```

## Spécifications techniques

### PTY Manager (src/pty-manager.js)

```javascript
class PtyManager {
  constructor(maxInstances = 5) {}
  
  // Créer une nouvelle instance
  create(cwd) → { id, pty }
  
  // Récupérer une instance
  get(id) → instance | null
  
  // Lister toutes les instances
  list() → [instances]
  
  // Fermer une instance
  close(id) → Promise<void>
  
  // Fermer toutes les instances (cleanup)
  closeAll() → Promise<void>
  
  // Écrire dans le PTY
  write(id, data) → void
  
  // Redimensionner le PTY
  resize(id, cols, rows) → void
}
```

### Configuration (src/config.js)

```javascript
export default {
  port: 3000,
  host: 'localhost',
  maxInstances: 5,
  pty: {
    shell: 'claude',        // Commande à exécuter
    args: [],               // Arguments additionnels
    env: process.env,       // Variables d'environnement
  },
  terminal: {
    defaultCols: 120,
    defaultRows: 30,
  },
  gracefulShutdownTimeout: 5000,  // ms avant SIGKILL
}
```

### Gestion des erreurs

1. **Dossier inexistant** : Retourner erreur 400 avec message clair
2. **Limite atteinte** : Retourner erreur 429 "Too many instances"
3. **Processus crash** : Notifier le client, afficher message dans le terminal
4. **WebSocket déconnecté** : Tentative de reconnexion automatique (3 essais)

### Sécurité (usage local)

- Bind uniquement sur localhost (127.0.0.1)
- Pas d'authentification nécessaire (local)
- Validation des chemins (pas de path traversal)
- Sanitization des inputs

## Interface utilisateur - Détails

### Style visuel

```css
/* Couleurs suggérées */
--bg-primary: #1e1e2e;      /* Fond principal (sombre) */
--bg-secondary: #313244;     /* Fond panels */
--bg-terminal: #11111b;      /* Fond terminal */
--accent: #89b4fa;           /* Bleu accent */
--accent-active: #a6e3a1;    /* Vert pour terminal actif */
--text: #cdd6f4;             /* Texte principal */
--text-muted: #6c7086;       /* Texte secondaire */
--border: #45475a;           /* Bordures */
--danger: #f38ba8;           /* Rouge pour fermer */
```

### Composants UI

#### Header de l'application
- Titre "Claude Code UI"
- Bouton "Nouvelle instance" (+ icône)
- Compteur : "3/5 instances"

#### Panel terminal
```
┌─────────────────────────────────────────┐
│ 📁 ~/projects/mon-projet          [×]  │  ← Header
├─────────────────────────────────────────┤
│ $                                       │
│ > claude                                │
│                                         │  ← Terminal xterm.js
│ ╭────────────────────────────────────╮  │
│ │ Welcome to Claude Code!            │  │
│ ╰────────────────────────────────────╯  │
│                                         │
└─────────────────────────────────────────┘
```

#### Modal nouvelle instance
- Input texte pour le chemin
- Bouton parcourir (si supporté)
- Liste des dossiers récents (localStorage)
- Boutons Annuler / Créer

## Comportements attendus

### Au démarrage du serveur
1. Initialiser Express et WebSocket server
2. Créer le PtyManager
3. Servir les fichiers statiques
4. Log : "Claude Code UI running on http://localhost:3000"

### Au chargement de la page
1. Fetch GET /api/instances
2. Pour chaque instance existante, créer un panel et connecter WebSocket
3. Afficher les panels vides pour les slots disponibles

### À la création d'une instance
1. POST /api/instances avec le cwd
2. Recevoir l'ID
3. Créer le panel UI
4. Connecter WebSocket à /terminal/:id
5. Focus automatique sur le nouveau terminal

### À la fermeture d'une instance
1. DELETE /api/instances/:id
2. Fermer la connexion WebSocket
3. Retirer le panel ou le marquer comme "fermé"
4. Optionnel : garder l'historique visible (grisé)

### À la fermeture du serveur (SIGINT/SIGTERM)
1. Fermer toutes les instances proprement
2. Attendre la fin des processus
3. Fermer le serveur HTTP/WS
4. Exit

## Tests manuels à effectuer

1. [ ] Créer une instance dans un dossier valide
2. [ ] Taper des commandes et voir l'output
3. [ ] Créer 5 instances (limite)
4. [ ] Essayer d'en créer une 6ème (doit échouer)
5. [ ] Fermer une instance
6. [ ] Refresh la page et vérifier la reconnexion
7. [ ] Redimensionner la fenêtre
8. [ ] Ctrl+C dans un terminal
9. [ ] Fermer le serveur et vérifier le cleanup

## Évolutions futures (hors scope initial)

- [ ] Historique des commandes partagé
- [ ] Templates de prompts
- [ ] Sauvegarde/restauration de sessions
- [ ] Thèmes personnalisables
- [ ] Raccourcis clavier globaux
- [ ] Split horizontal/vertical des panels
- [ ] Export de conversation
- [ ] Notifications (tâche terminée, erreur)

## Commandes pour démarrer

```bash
# Installation
npm install

# Lancement en développement
npm run dev

# Lancement en production
npm start
```

L'application sera accessible sur http://localhost:3000
