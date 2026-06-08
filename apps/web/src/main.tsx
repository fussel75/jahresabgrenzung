import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { AppStateProvider } from './state';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projektliste } from './pages/Projektliste';
import { Projektdetail } from './pages/Projektdetail';
import { ProjektNeu } from './pages/ProjektNeu';
import { Abgrenzungsbericht } from './pages/Abgrenzungsbericht';
import { Import } from './pages/Import';
import { Einstellungen } from './pages/Einstellungen';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/projekte', element: <Projektliste /> },
      { path: '/projekte/neu', element: <ProjektNeu /> },
      { path: '/projekte/:id', element: <Projektdetail /> },
      { path: '/abgrenzung', element: <Abgrenzungsbericht /> },
      { path: '/import', element: <Import /> },
      { path: '/einstellungen', element: <Einstellungen /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  </React.StrictMode>,
);
