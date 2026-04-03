import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // INJECTED ROUTER PROVIDER
import App from './App.jsx';
// Keep your existing CSS import here if you have one (e.g., import './index.css')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);