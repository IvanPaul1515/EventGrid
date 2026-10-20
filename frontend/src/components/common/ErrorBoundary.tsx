import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó una excepción en componente:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-card border border-destructive/30 rounded-2xl shadow-2xl text-center space-y-4 animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20 shadow-sm">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-foreground">
            Se produjo un error al renderizar esta sección
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se ha prevenido que la pantalla se quede en blanco. El detalle del error se muestra a continuación:
          </p>
          <div className="p-3 bg-background border border-border rounded-xl text-left">
            <p className="text-xs font-mono text-destructive break-all">
              {this.state.error?.message || 'Error desconocido'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer inline-flex items-center gap-2 shadow-md shadow-primary/25"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reintentar carga</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
