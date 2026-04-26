import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <section className="card">
        <span className="eyebrow">Frontend inicializado</span>
        <h1>Plotagem de Moldes</h1>
        <p>
          O backend PHP esta acessivel em <code>http://localhost:8080</code> e o Vite em <code>http://localhost:4173</code>.
        </p>
        <p>
          A interface completa anterior nao esta mais nesta pasta. Este arquivo recoloca a entrada do React para o ambiente
          de desenvolvimento voltar a subir sem erro.
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
