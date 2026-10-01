import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import "./lib/tema";
import App from "./App.tsx";
import {
  ProtecaoAplicativo,
  AvisoConexao,
} from "./components/ProtecaoAplicativo";
const consultas = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1 },
    mutations: { retry: false },
  },
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <ProtecaoAplicativo>
        <AvisoConexao />
        <App />
      </ProtecaoAplicativo>
    </QueryClientProvider>
  </StrictMode>,
);
