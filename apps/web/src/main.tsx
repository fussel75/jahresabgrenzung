import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

/**
 * Platzhalter-Einstieg (Schritt 1 des Repo-Setups).
 * Das eigentliche Frontend (Dashboard, Projektliste, Gantt …) folgt in
 * Schritt 7 der Umsetzung (siehe SPEC.md §12).
 */
function App() {
  return (
    <main className="app-placeholder">
      <h1>Jahresabgrenzung</h1>
      <p>FriStD-Bau ZuB GmbH &amp; Co. KG</p>
      <p>Frontend folgt in Schritt 7 der Umsetzung.</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
