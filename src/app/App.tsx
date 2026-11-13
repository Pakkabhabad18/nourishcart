// Routes. Signed-out users see landing and sign-in only; signed-in users without a
// profile are sent to the first-run welcome; the rest lives inside the app shell.
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context.tsx';
import { AppShell } from './AppShell.tsx';
import { useProfiles } from './hooks.ts';
import { Spinner } from '../components/ui.tsx';
import { LandingPage } from '../features/auth/LandingPage.tsx';
import { SignInPage } from '../features/auth/SignInPage.tsx';
import { WelcomePage } from '../features/profiles/WelcomePage.tsx';
import { ProfilesPage } from '../features/profiles/ProfilesPage.tsx';
import { OnboardingPage } from '../features/onboarding/OnboardingPage.tsx';
import { QuickSetupPage } from '../features/onboarding/QuickSetupPage.tsx';
import { EvaluationPage } from '../features/evaluation/EvaluationPage.tsx';
import { StoreOrderPage } from '../features/orders/StoreOrderPage.tsx';
import { ComparePage } from '../features/groceries/ComparePage.tsx';
import { ScanPage } from '../features/scan/ScanPage.tsx';
import { NutritionPage } from '../features/nutrition/NutritionPage.tsx';
import { PlansPage } from '../features/meal-plans/PlansPage.tsx';
import { RecipePage } from '../features/meal-plans/RecipePage.tsx';
import { GroceriesPage } from '../features/groceries/GroceriesPage.tsx';
import { CataloguePage } from '../features/groceries/CataloguePage.tsx';
import { CheckoutPage } from '../features/orders/CheckoutPage.tsx';
import { OrdersPage, OrderDetailPage } from '../features/orders/OrdersPage.tsx';
import { PantryPage } from '../features/pantry/PantryPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';
import { OverviewPage } from '../features/overview/OverviewPage.tsx';
import { NotFound } from './NotFound.tsx';

// Private data is never persisted by the query cache; refetch on focus keeps profiles fresh.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

function RequireAuth() {
  const { session, sessionLoading } = useApp();
  const loc = useLocation();
  if (sessionLoading) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

function RequireProfile() {
  const profiles = useProfiles();
  const none = (profiles.data ?? []).length === 0;
  if (profiles.isLoading || (none && profiles.isFetching)) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (none) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

function Home() {
  const { session, sessionLoading } = useApp();
  if (sessionLoading) return null;
  return session ? <Navigate to="/overview" replace /> : <LandingPage />;
}

// browser (default, Cloudflare Pages), hash (sub-path hosting) or memory (sandboxed review previews).
const mode = import.meta.env.VITE_ROUTER_MODE;
const Router = mode === 'hash' ? HashRouter : mode === 'memory' ? (props: { children: React.ReactNode }) => <MemoryRouter initialEntries={['/']}>{props.children}</MemoryRouter> : BrowserRouter;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/welcome" element={<WelcomePage />} />
              <Route element={<RequireProfile />}>
                <Route element={<AppShell />}>
                  <Route path="/overview" element={<OverviewPage />} />
                  <Route path="/profiles" element={<ProfilesPage />} />
                  <Route path="/profiles/:id/setup" element={<OnboardingPage />} />
                  <Route path="/profiles/:id/quick" element={<QuickSetupPage />} />
                  <Route path="/evaluation" element={<EvaluationPage />} />
                  <Route path="/nutrition" element={<NutritionPage />} />
                  <Route path="/plans" element={<PlansPage />} />
                  <Route path="/recipes/:id" element={<RecipePage />} />
                  <Route path="/groceries" element={<GroceriesPage />} />
                  <Route path="/groceries/catalogue" element={<CataloguePage />} />
                  <Route path="/groceries/compare" element={<ComparePage />} />
                  <Route path="/scan" element={<ScanPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/checkout/store" element={<StoreOrderPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/pantry" element={<PantryPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AppProvider>
    </QueryClientProvider>
  );
}
