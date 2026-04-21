import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <HashRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "rgba(18,18,24,0.95)",
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            backdropFilter: "blur(20px)",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          },
          success: {
            iconTheme: { primary: "#4ade80", secondary: "rgba(18,18,24,0.95)" },
          },
          error: {
            iconTheme: { primary: "#f87171", secondary: "rgba(18,18,24,0.95)" },
          },
        }}
      />
    </HashRouter>
  </QueryClientProvider>
);
