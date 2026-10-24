import React, { useState, Suspense, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from './ErrorBoundary';
import { AppLoadingScreen } from './AppLoadingScreen';
import { ConnectionBanner } from './ConnectionBanner';

export const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setMobileMenuOpen(false);
  }, [pathname]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-viewport flex h-screen overflow-hidden bg-background">
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <ConnectionBanner />
        <main ref={scrollRef} data-app-scroll className="flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 bg-background pb-safe-content">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <ErrorBoundary key={pathname}>
              <div className="spa-content-area">
                <Suspense
                  fallback={
                    <div className="min-h-[450px] flex items-center justify-center">
                      <AppLoadingScreen compact message="Cargando contenido..." />
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </div>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
