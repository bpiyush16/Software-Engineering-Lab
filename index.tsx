import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Explicitly define interfaces for ErrorBoundary to fix TS errors
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Simple Error Boundary for development stability
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Explicitly define state property
  public state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() { return { hasError: true }; }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-10 font-mono">
          <div className="max-w-md">
            <h1 className="text-red-500 text-2xl font-bold mb-4">CRITICAL SYSTEM ERROR</h1>
            <p className="text-sm opacity-60 mb-8">The DocRoute AI instance encountered an unrecoverable rendering error. This usually happens due to corrupted LocalStorage data or API key issues.</p>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="px-6 py-3 bg-red-600 rounded-lg text-xs font-bold uppercase tracking-widest">Reset Instance</button>
          </div>
        </div>
      );
    }
    // Fix: access props correctly by casting 'this' to any to bypass property existence issues in strict environments
    return (this as any).props.children;
  }
}

root.render(
  <React.StrictMode>
    {/* Fix: ErrorBoundary children requirement met via optional definition or explicit passing */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);