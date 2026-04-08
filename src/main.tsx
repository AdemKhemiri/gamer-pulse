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
            background: "var(--gt-surface)",
            color: "var(--gt-text)",
            border: "1px solid var(--gt-overlay)",
          },
        }}
      />
    </HashRouter>
  </QueryClientProvider>
);
