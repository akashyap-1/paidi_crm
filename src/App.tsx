import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Login } from "./auth/Login";
import { Shell } from "./components/Shell";
import { Loading, ToastProvider } from "./components/ui";
import { useLiveTables } from "./lib/live";
import { CompanyDetail } from "./pages/CompanyDetail";
import { Contacts } from "./pages/Contacts";
import { Dashboards } from "./pages/Dashboards";
import { Home } from "./pages/Home";
import { Import } from "./pages/Import";
import { Pipeline } from "./pages/Pipeline";
import { Review } from "./pages/Review";
import { Settings } from "./pages/Settings";
import { Tasks } from "./pages/Tasks";
import { Templates } from "./pages/Templates";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

function LiveUpdates() {
  useLiveTables();
  return null;
}

function Gate() {
  const { status, signOut } = useAuth();
  if (status === "loading") {
    return <div className="grid min-h-dvh place-items-center"><Loading label="Opening PAIDI CRM" /></div>;
  }
  if (status === "signed-out") return <Login />;
  if (status === "not-allowed") return <Login notAllowed onSignOut={signOut} />;
  return (
    <>
    <LiveUpdates />
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="company/:id" element={<CompanyDetail />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="templates" element={<Templates />} />
        <Route path="review" element={<Review />} />
        <Route path="dashboards" element={<Dashboards />} />
        <Route path="import" element={<Import />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <HashRouter>
            <Gate />
          </HashRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
