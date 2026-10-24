import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorPanel } from './ErrorPanel';
interface Props { children: ReactNode; }
export class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('EventGrid render error', error, info);
    else console.error('EventGrid: fallo de renderizado.');
  }
  render() {
    if (this.state.hasError) return <ErrorPanel kind="500" home={localStorage.getItem('barcamp_token') ? '/' : '/login'} onRetry={() => this.setState({ hasError: false })} />;
    return this.props.children;
  }
}
